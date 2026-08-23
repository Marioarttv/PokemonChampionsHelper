#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <mach-o/dyld.h>
#import <mach-o/loader.h>
#import <ptrauth.h>

#import "ChampionsOverlay.h"

#include <algorithm>
#include <cstdarg>
#include <cstdint>
#include <cstring>

namespace ChampionsAdvisor {

static NSString *const kSupportedVersion = @"1.1.4";
static NSString *const kSupportedBuild = @"25";
static NSString *const kUnityFrameworkSha256 = @"e162bcd191a4a0fab1c131ed2d7b7755ecc675074da28868a7006c9b54e56dab";
static NSString *const kUnityFrameworkUuid = @"30C1CBE3-025E-3590-88C3-2FEE8235D2A3";
static constexpr uint8_t kUnityFrameworkUuidBytes[16] = {
    0x30, 0xC1, 0xCB, 0xE3, 0x02, 0x5E, 0x35, 0x90,
    0x88, 0xC3, 0x2F, 0xEE, 0x82, 0x35, 0xD2, 0xA3
};
static constexpr uintptr_t kBattleLocalUserDataGetRva = 0x01A16FF8;
static constexpr NSTimeInterval kPollIntervalSeconds = 1.0;
static constexpr NSUInteger kMaxTeams = 4;
static constexpr NSUInteger kMaxPokemon = 6;
static constexpr NSUInteger kMaxMoves = 4;
static constexpr NSUInteger kMaxEffects = 32;

static NSString *gOutputDirectory;
static NSString *gLogPath;
static NSString *gSnapshotPath;
static NSString *gLastStateHash;
static BOOL gEnabled = NO;
static BOOL gLoggedWaitingForUnity = NO;
static BOOL gLoggedProfileMismatch = NO;

template <typename T>
static T ReadField(const void *object, size_t offset) {
    T value{};
    std::memcpy(&value, static_cast<const uint8_t *>(object) + offset, sizeof(T));
    return value;
}

static bool IsManagedPointer(const void *pointer) {
    const uintptr_t value = reinterpret_cast<uintptr_t>(pointer);
    return value >= 0x100000000ULL && (value & 0x7ULL) == 0;
}

static NSNumber *Int32Number(const void *object, size_t offset) {
    return @(ReadField<int32_t>(object, offset));
}

static NSNumber *ByteNumber(const void *object, size_t offset) {
    return @(ReadField<uint8_t>(object, offset));
}

static NSNumber *BoolNumber(const void *object, size_t offset) {
    return @(ReadField<uint8_t>(object, offset) != 0);
}

static NSUInteger ArrayCount(void *array, NSUInteger maximum) {
    if (!IsManagedPointer(array)) {
        return 0;
    }

    const uint64_t count = ReadField<uint64_t>(array, 0x18);
    if (count > maximum) {
        return maximum;
    }
    return static_cast<NSUInteger>(count);
}

static void *ObjectArrayItem(void *array, NSUInteger index, NSUInteger maximum) {
    const NSUInteger count = ArrayCount(array, maximum);
    if (index >= count) {
        return nullptr;
    }
    return ReadField<void *>(array, 0x20 + index * sizeof(void *));
}

static NSArray<NSNumber *> *Int32ArraySnapshot(void *array, NSUInteger maximum) {
    const NSUInteger count = ArrayCount(array, maximum);
    NSMutableArray<NSNumber *> *values = [NSMutableArray arrayWithCapacity:count];
    for (NSUInteger index = 0; index < count; ++index) {
        const int32_t value = ReadField<int32_t>(array, 0x20 + index * sizeof(int32_t));
        [values addObject:@(value)];
    }
    return values;
}

static NSUInteger ListCount(void *list, NSUInteger maximum) {
    if (!IsManagedPointer(list)) {
        return 0;
    }

    const int32_t size = ReadField<int32_t>(list, 0x18);
    void *items = ReadField<void *>(list, 0x10);
    if (size <= 0 || !IsManagedPointer(items)) {
        return 0;
    }

    const NSUInteger arrayCount = ArrayCount(items, maximum);
    return std::min(static_cast<NSUInteger>(size), arrayCount);
}

static void *ListItem(void *list, NSUInteger index, NSUInteger maximum) {
    const NSUInteger count = ListCount(list, maximum);
    if (index >= count) {
        return nullptr;
    }
    void *items = ReadField<void *>(list, 0x10);
    return ObjectArrayItem(items, index, maximum);
}

static NSString *OutputDirectory(void) {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        gOutputDirectory = [[NSHomeDirectory() stringByAppendingPathComponent:@"Documents"]
            stringByAppendingPathComponent:@"ChampionsAdvisor"];
        gLogPath = [gOutputDirectory stringByAppendingPathComponent:@"probe.log"];
        gSnapshotPath = [gOutputDirectory stringByAppendingPathComponent:@"snapshot.json"];
        [[NSFileManager defaultManager] createDirectoryAtPath:gOutputDirectory
                                  withIntermediateDirectories:YES
                                                   attributes:nil
                                                        error:nil];
    });
    return gOutputDirectory;
}

static NSString *Timestamp(void) {
    static NSISO8601DateFormatter *formatter;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        formatter = [[NSISO8601DateFormatter alloc] init];
        formatter.formatOptions = NSISO8601DateFormatWithInternetDateTime | NSISO8601DateFormatWithFractionalSeconds;
    });
    return [formatter stringFromDate:[NSDate date]];
}

static void Log(NSString *format, ...) NS_FORMAT_FUNCTION(1, 2);
static void Log(NSString *format, ...) {
    OutputDirectory();

    va_list arguments;
    va_start(arguments, format);
    NSString *message = [[NSString alloc] initWithFormat:format arguments:arguments];
    va_end(arguments);

    NSString *line = [NSString stringWithFormat:@"%@ %@\n", Timestamp(), message];
    NSData *data = [line dataUsingEncoding:NSUTF8StringEncoding];
    NSFileManager *manager = [NSFileManager defaultManager];
    if (![manager fileExistsAtPath:gLogPath]) {
        [manager createFileAtPath:gLogPath contents:nil attributes:nil];
    }

    NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:gLogPath];
    [handle seekToEndOfFile];
    [handle writeData:data];
    [handle closeFile];
    NSLog(@"[ChampionsAdvisorProbe] %@", message);
}

static NSArray<NSDictionary *> *EffectSnapshot(void *management) {
    if (!IsManagedPointer(management)) {
        return @[];
    }

    void *list = ReadField<void *>(management, 0x10);
    const NSUInteger count = ListCount(list, kMaxEffects);
    NSMutableArray<NSDictionary *> *effects = [NSMutableArray arrayWithCapacity:count];
    for (NSUInteger index = 0; index < count; ++index) {
        void *effect = ListItem(list, index, kMaxEffects);
        if (!IsManagedPointer(effect)) {
            continue;
        }

        [effects addObject:@{
            @"md_id": Int32Number(effect, 0x10),
            @"lifespan_turns": Int32Number(effect, 0x14),
            @"elapsed_turns": Int32Number(effect, 0x18),
            @"step_or_count": Int32Number(effect, 0x1C),
            @"execute_kind": @((int16_t)ReadField<int16_t>(effect, 0x20)),
            @"execute_id": Int32Number(effect, 0x24),
            @"target_execute_kind": @((int16_t)ReadField<int16_t>(effect, 0x28)),
            @"target_execute_id": Int32Number(effect, 0x2C)
        }];
    }
    return effects;
}

static NSDictionary *MoveSnapshot(void *move) {
    return @{
        @"md_id": Int32Number(move, 0x2C),
        @"slot_index": Int32Number(move, 0x30),
        @"current_pp": Int32Number(move, 0x18),
        @"max_pp": Int32Number(move, 0x1C),
        @"locked": BoolNumber(move, 0x20),
        @"lock_execute_kind": @((int16_t)ReadField<int16_t>(move, 0x22)),
        @"lock_data_kind": @((int16_t)ReadField<int16_t>(move, 0x24)),
        @"lock_data_md_id": Int32Number(move, 0x28),
        @"target": @((int16_t)ReadField<int16_t>(move, 0x48)),
        @"move_type": ByteNumber(move, 0x4A)
    };
}

static NSArray<NSDictionary *> *MoveArraySnapshot(void *array) {
    const NSUInteger count = ArrayCount(array, kMaxMoves);
    NSMutableArray<NSDictionary *> *moves = [NSMutableArray arrayWithCapacity:count];
    for (NSUInteger index = 0; index < count; ++index) {
        void *move = ObjectArrayItem(array, index, kMaxMoves);
        if (IsManagedPointer(move)) {
            [moves addObject:MoveSnapshot(move)];
        }
    }
    return moves;
}

static NSDictionary *PokemonSnapshot(void *pokemon) {
    void *basePoints = ReadField<void *>(pokemon, 0x168);
    NSDictionary *basePointSnapshot = @{};
    if (IsManagedPointer(basePoints)) {
        basePointSnapshot = @{
            @"hp": ByteNumber(basePoints, 0x10),
            @"attack": ByteNumber(basePoints, 0x11),
            @"defense": ByteNumber(basePoints, 0x12),
            @"special_attack": ByteNumber(basePoints, 0x13),
            @"special_defense": ByteNumber(basePoints, 0x14),
            @"speed": ByteNumber(basePoints, 0x15)
        };
    }

    void *moves = ReadField<void *>(pokemon, 0x120);
    return @{
        @"personal_md_index": Int32Number(pokemon, 0x30),
        @"personal_id": Int32Number(pokemon, 0x34),
        @"form_no": Int32Number(pokemon, 0x38),
        @"gender": Int32Number(pokemon, 0x3C),
        @"user_index": Int32Number(pokemon, 0x40),
        @"team_group_index": Int32Number(pokemon, 0x44),
        @"is_local_team": BoolNumber(pokemon, 0x48),
        @"item_md_id": Int32Number(pokemon, 0x20),
        @"ability_md_id": Int32Number(pokemon, 0xC8),
        @"last_ability_md_id": Int32Number(pokemon, 0xCC),
        @"group_index": Int32Number(pokemon, 0xD0),
        @"team_user_index": Int32Number(pokemon, 0xD4),
        @"team_pokemon_index": Int32Number(pokemon, 0xD8),
        @"side_index": Int32Number(pokemon, 0xDC),
        @"position_index": Int32Number(pokemon, 0xE0),
        @"max_hp": Int32Number(pokemon, 0xE4),
        @"current_hp": Int32Number(pokemon, 0xE8),
        @"raw_hp_ratio": Int32Number(pokemon, 0xEC),
        @"fainted": BoolNumber(pokemon, 0x130),
        @"needs_change": BoolNumber(pokemon, 0x131),
        @"move_select_auto": BoolNumber(pokemon, 0x132),
        @"change_select_locked": BoolNumber(pokemon, 0x133),
        @"substitute": BoolNumber(pokemon, 0x13C),
        @"can_mega": BoolNumber(pokemon, 0x13D),
        @"mega_locked": BoolNumber(pokemon, 0x13E),
        @"mega_mode": BoolNumber(pokemon, 0x13F),
        @"type_1": ByteNumber(pokemon, 0x140),
        @"type_2": ByteNumber(pokemon, 0x141),
        @"extra_type": ByteNumber(pokemon, 0x150),
        @"extra_type_cause": ByteNumber(pokemon, 0x151),
        @"illusion_active": BoolNumber(pokemon, 0x152),
        @"illusion_revealed": BoolNumber(pokemon, 0x153),
        @"status_condition": Int32Number(pokemon, 0x154),
        @"nature_correction_md_id": @((uint16_t)ReadField<uint16_t>(pokemon, 0x170)),
        @"selection_order": Int32Number(pokemon, 0x180),
        @"entered_field": BoolNumber(pokemon, 0x190),
        @"stat_stages": @{
            @"hp": Int32Number(pokemon, 0xF8),
            @"attack": Int32Number(pokemon, 0xFC),
            @"defense": Int32Number(pokemon, 0x100),
            @"special_attack": Int32Number(pokemon, 0x104),
            @"special_defense": Int32Number(pokemon, 0x108),
            @"speed": Int32Number(pokemon, 0x10C),
            @"accuracy": Int32Number(pokemon, 0x110),
            @"evasion": Int32Number(pokemon, 0x114),
            @"critical": Int32Number(pokemon, 0x118)
        },
        @"base_points": basePointSnapshot,
        @"moves": MoveArraySnapshot(moves),
        @"volatile_effects": EffectSnapshot(ReadField<void *>(pokemon, 0x158)),
        @"field_effects": EffectSnapshot(ReadField<void *>(pokemon, 0x160))
    };
}

static NSDictionary *TeamSnapshot(void *team) {
    void *roster = ReadField<void *>(team, 0x18);
    const NSUInteger rosterCount = ArrayCount(roster, kMaxPokemon);
    NSMutableArray<NSDictionary *> *pokemon = [NSMutableArray arrayWithCapacity:rosterCount];
    for (NSUInteger index = 0; index < rosterCount; ++index) {
        void *entry = ObjectArrayItem(roster, index, kMaxPokemon);
        if (IsManagedPointer(entry)) {
            [pokemon addObject:PokemonSnapshot(entry)];
        }
    }

    void *selected = ReadField<void *>(team, 0x20);
    const NSUInteger selectedCount = ArrayCount(selected, kMaxPokemon);
    NSMutableArray<NSNumber *> *selectedGroupIndices = [NSMutableArray arrayWithCapacity:selectedCount];
    for (NSUInteger index = 0; index < selectedCount; ++index) {
        void *entry = ObjectArrayItem(selected, index, kMaxPokemon);
        if (IsManagedPointer(entry)) {
            [selectedGroupIndices addObject:Int32Number(entry, 0xD0)];
        }
    }

    return @{
        @"battle_rule": ByteNumber(team, 0x28),
        @"is_local_player": BoolNumber(team, 0x5A),
        @"team_index": Int32Number(team, 0x5C),
        @"selected_entry": BoolNumber(team, 0x78),
        @"waiting_for_action": BoolNumber(team, 0x79),
        @"pokemon_order": Int32ArraySnapshot(ReadField<void *>(team, 0x30), kMaxPokemon),
        @"selected_group_indices": selectedGroupIndices,
        @"pokemon": pokemon
    };
}

static NSArray<NSDictionary *> *PositionSnapshots(void *positionArray) {
    const NSUInteger count = ArrayCount(positionArray, 8);
    NSMutableArray<NSDictionary *> *positions = [NSMutableArray arrayWithCapacity:count];
    for (NSUInteger index = 0; index < count; ++index) {
        void *position = ObjectArrayItem(positionArray, index, 8);
        if (!IsManagedPointer(position)) {
            continue;
        }

        void *registeredPokemon = ReadField<void *>(position, 0x18);
        NSMutableDictionary *snapshot = [@{
            @"side_index": Int32Number(position, 0x10),
            @"position_index": Int32Number(position, 0x14),
            @"field_effects": EffectSnapshot(ReadField<void *>(position, 0x28))
        } mutableCopy];
        if (IsManagedPointer(registeredPokemon)) {
            snapshot[@"registered_group_index"] = Int32Number(registeredPokemon, 0xD0);
            snapshot[@"registered_user_index"] = Int32Number(registeredPokemon, 0xD4);
        }
        [positions addObject:snapshot];
    }
    return positions;
}

static NSDictionary *WorldSnapshot(void *world) {
    if (!IsManagedPointer(world)) {
        return @{};
    }

    void *sideArray = ReadField<void *>(world, 0x10);
    const NSUInteger sideCount = ArrayCount(sideArray, 4);
    NSMutableArray<NSDictionary *> *sides = [NSMutableArray arrayWithCapacity:sideCount];
    for (NSUInteger index = 0; index < sideCount; ++index) {
        void *side = ObjectArrayItem(sideArray, index, 4);
        if (!IsManagedPointer(side)) {
            continue;
        }
        [sides addObject:@{
            @"side_index": Int32Number(side, 0x10),
            @"field_effects": EffectSnapshot(ReadField<void *>(side, 0x20)),
            @"positions": PositionSnapshots(ReadField<void *>(side, 0x18))
        }];
    }

    return @{
        @"battle_rule": ByteNumber(world, 0x18),
        @"weather_md_id": Int32Number(world, 0x1C),
        @"weather_lifespan_turns": Int32Number(world, 0x20),
        @"weather_elapsed_turns": Int32Number(world, 0x24),
        @"elapsed_turns": Int32Number(world, 0x30),
        @"field_effects": EffectSnapshot(ReadField<void *>(world, 0x28)),
        @"sides": sides
    };
}

static NSDictionary *ObservabilitySnapshot(NSArray<NSDictionary *> *teams) {
    NSUInteger remotePokemon = 0;
    NSUInteger remoteWithMoves = 0;
    NSUInteger remoteWithItems = 0;
    NSUInteger remoteWithAbilities = 0;
    NSUInteger remoteWithBasePoints = 0;

    for (NSDictionary *team in teams) {
        if ([team[@"is_local_player"] boolValue]) {
            continue;
        }
        for (NSDictionary *pokemon in team[@"pokemon"]) {
            ++remotePokemon;
            if ([pokemon[@"moves"] count] > 0) {
                ++remoteWithMoves;
            }
            if ([pokemon[@"item_md_id"] intValue] > 0) {
                ++remoteWithItems;
            }
            if ([pokemon[@"ability_md_id"] intValue] > 0) {
                ++remoteWithAbilities;
            }
            NSDictionary *basePoints = pokemon[@"base_points"];
            BOOL hasBasePointData = NO;
            for (NSNumber *value in basePoints.allValues) {
                if (value.intValue > 0) {
                    hasBasePointData = YES;
                    break;
                }
            }
            if (hasBasePointData) {
                ++remoteWithBasePoints;
            }
        }
    }

    return @{
        @"remote_pokemon": @(remotePokemon),
        @"remote_with_moves": @(remoteWithMoves),
        @"remote_with_items": @(remoteWithItems),
        @"remote_with_abilities": @(remoteWithAbilities),
        @"remote_with_base_points": @(remoteWithBasePoints)
    };
}

static NSDictionary *BattleSnapshot(void *battleUserData) {
    void *teamList = ReadField<void *>(battleUserData, 0x10);
    const NSUInteger teamCount = ListCount(teamList, kMaxTeams);
    NSMutableArray<NSDictionary *> *teams = [NSMutableArray arrayWithCapacity:teamCount];
    for (NSUInteger index = 0; index < teamCount; ++index) {
        void *team = ListItem(teamList, index, kMaxTeams);
        if (IsManagedPointer(team)) {
            [teams addObject:TeamSnapshot(team)];
        }
    }

    NSDictionary *state = @{
        @"available": @(teamCount > 0),
        @"battle_rule": ByteNumber(battleUserData, 0x20),
        @"battle_type": ByteNumber(battleUserData, 0x21),
        @"battle_stage_md_id": Int32Number(battleUserData, 0x24),
        @"local_team_index": Int32Number(battleUserData, 0x40),
        @"replay_mode": BoolNumber(battleUserData, 0x50),
        @"spectator_mode": BoolNumber(battleUserData, 0x51),
        @"spectator_mode_type": Int32Number(battleUserData, 0x54),
        @"world": WorldSnapshot(ReadField<void *>(battleUserData, 0x18)),
        @"teams": teams,
        @"opponent_observability": ObservabilitySnapshot(teams)
    };
    return state;
}

static uint64_t Fnv1a64(NSData *data) {
    const uint8_t *bytes = static_cast<const uint8_t *>(data.bytes);
    uint64_t hash = 14695981039346656037ULL;
    for (NSUInteger index = 0; index < data.length; ++index) {
        hash ^= bytes[index];
        hash *= 1099511628211ULL;
    }
    return hash;
}

static NSString *StateHash(NSDictionary *state) {
    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:state options:NSJSONWritingSortedKeys error:&error];
    if (!data || error) {
        return nil;
    }
    return [NSString stringWithFormat:@"%016llx", Fnv1a64(data)];
}

static void WriteSnapshot(NSDictionary *state) {
    NSString *stateHash = StateHash(state);
    if (!stateHash || [gLastStateHash isEqualToString:stateHash]) {
        return;
    }

    NSDictionary *document = @{
        @"schema_version": @1,
        @"captured_at": Timestamp(),
        @"state_hash": stateHash,
        @"source": @{
            @"bundle_id": @"jp.pokemon.pokemonchampions",
            @"app_version": kSupportedVersion,
            @"app_build": kSupportedBuild,
            @"unity_framework_sha256": kUnityFrameworkSha256,
            @"unity_framework_uuid": kUnityFrameworkUuid,
            @"offset_profile": @"champions-1.1.4-25-arm64e-v1"
        },
        @"state": state
    };

    NSError *serializationError = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:document
                                                   options:NSJSONWritingPrettyPrinted | NSJSONWritingSortedKeys
                                                     error:&serializationError];
    if (!data) {
        Log(@"Snapshot serialization failed: %@", serializationError.localizedDescription);
        return;
    }

    NSError *writeError = nil;
    if (![data writeToFile:gSnapshotPath options:NSDataWritingAtomic error:&writeError]) {
        Log(@"Snapshot write failed: %@", writeError.localizedDescription);
        return;
    }

    gLastStateHash = stateHash;
    ChampionsAdvisorOverlayUpdateSnapshot(document);
    NSDictionary *observability = state[@"opponent_observability"];
    Log(@"Snapshot %@: available=%@ teams=%lu turn=%@ remote=%@ remoteMoves=%@ remoteItems=%@ remoteAbilities=%@",
        stateHash,
        state[@"available"],
        (unsigned long)[state[@"teams"] count],
        state[@"world"][@"elapsed_turns"] ?: @0,
        observability[@"remote_pokemon"] ?: @0,
        observability[@"remote_with_moves"] ?: @0,
        observability[@"remote_with_items"] ?: @0,
        observability[@"remote_with_abilities"] ?: @0);
}

enum class UnityImageStatus {
    NotLoaded,
    Match,
    Mismatch
};

static bool UnityFrameworkUuidMatches(const struct mach_header *genericHeader) {
    if (!genericHeader || genericHeader->magic != MH_MAGIC_64) {
        return false;
    }

    const struct mach_header_64 *header = reinterpret_cast<const struct mach_header_64 *>(genericHeader);
    const uint8_t *cursor = reinterpret_cast<const uint8_t *>(header) + sizeof(struct mach_header_64);
    for (uint32_t commandIndex = 0; commandIndex < header->ncmds; ++commandIndex) {
        const struct load_command *command = reinterpret_cast<const struct load_command *>(cursor);
        if (command->cmdsize < sizeof(struct load_command)) {
            return false;
        }
        if (command->cmd == LC_UUID && command->cmdsize >= sizeof(struct uuid_command)) {
            const struct uuid_command *uuidCommand = reinterpret_cast<const struct uuid_command *>(command);
            return std::memcmp(uuidCommand->uuid, kUnityFrameworkUuidBytes, sizeof(kUnityFrameworkUuidBytes)) == 0;
        }
        cursor += command->cmdsize;
    }
    return false;
}

static UnityImageStatus FindUnityFramework(intptr_t *slide) {
    const uint32_t imageCount = _dyld_image_count();
    for (uint32_t index = 0; index < imageCount; ++index) {
        const char *name = _dyld_get_image_name(index);
        if (name && std::strstr(name, "/UnityFramework.framework/UnityFramework")) {
            if (!UnityFrameworkUuidMatches(_dyld_get_image_header(index))) {
                return UnityImageStatus::Mismatch;
            }
            *slide = _dyld_get_image_vmaddr_slide(index);
            return UnityImageStatus::Match;
        }
    }
    return UnityImageStatus::NotLoaded;
}

using BattleLocalUserDataGet = void *(*)(const void *methodInfo);

static BattleLocalUserDataGet ResolveBattleLocalUserDataGet(intptr_t slide) {
    if (slide == 0) {
        return nullptr;
    }

    void *rawFunction = reinterpret_cast<void *>(static_cast<uintptr_t>(slide) + kBattleLocalUserDataGetRva);
#if __has_feature(ptrauth_calls)
    rawFunction = ptrauth_sign_unauthenticated(rawFunction, ptrauth_key_function_pointer, 0);
#endif
    return reinterpret_cast<BattleLocalUserDataGet>(rawFunction);
}

static void Poll(void) {
    if (!gEnabled || UIApplication.sharedApplication.applicationState != UIApplicationStateActive) {
        return;
    }

    intptr_t slide = 0;
    const UnityImageStatus imageStatus = FindUnityFramework(&slide);
    if (imageStatus == UnityImageStatus::NotLoaded) {
        if (!gLoggedWaitingForUnity) {
            Log(@"Waiting for UnityFramework to load");
            gLoggedWaitingForUnity = YES;
        }
        return;
    }
    if (imageStatus == UnityImageStatus::Mismatch) {
        if (!gLoggedProfileMismatch) {
            Log(@"Disabled: UnityFramework UUID does not match supported profile %@", kUnityFrameworkUuid);
            gLoggedProfileMismatch = YES;
        }
        gEnabled = NO;
        return;
    }
    gLoggedWaitingForUnity = NO;

    BattleLocalUserDataGet getBattleUserData = ResolveBattleLocalUserDataGet(slide);
    if (!getBattleUserData) {
        Log(@"Unable to resolve BattleLocalUserData.Get; poll skipped");
        return;
    }

    void *battleUserData = getBattleUserData(nullptr);
    if (!IsManagedPointer(battleUserData)) {
        Log(@"BattleLocalUserData.Get returned an invalid object; poll skipped");
        return;
    }

    WriteSnapshot(BattleSnapshot(battleUserData));
}

static void ScheduleNextPoll(void) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, static_cast<int64_t>(kPollIntervalSeconds * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
        @autoreleasepool {
            Poll();
            ScheduleNextPoll();
        }
    });
}

static void Start(void) {
    OutputDirectory();
    ChampionsAdvisorOverlayStart(OutputDirectory());
    NSBundle *bundle = [NSBundle mainBundle];
    NSString *version = [bundle objectForInfoDictionaryKey:@"CFBundleShortVersionString"] ?: @"";
    NSString *build = [bundle objectForInfoDictionaryKey:@"CFBundleVersion"] ?: @"";
    if (![version isEqualToString:kSupportedVersion] || ![build isEqualToString:kSupportedBuild]) {
        ChampionsAdvisorOverlaySetError([NSString stringWithFormat:@"Unsupported game build %@ (%@); expected %@ (%@).",
            version, build, kSupportedVersion, kSupportedBuild]);
        Log(@"Disabled: unsupported Pokemon Champions build %@ (%@); expected %@ (%@)",
            version, build, kSupportedVersion, kSupportedBuild);
        return;
    }

    gEnabled = YES;
    Log(@"Enabled passive state probe for Pokemon Champions %@ (%@); output=%@", version, build, OutputDirectory());
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        @autoreleasepool {
            Poll();
            ScheduleNextPoll();
        }
    });
}

}  // namespace ChampionsAdvisor

%ctor {
    @autoreleasepool {
        ChampionsAdvisor::Start();
    }
}
