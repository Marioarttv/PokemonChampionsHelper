#import "ChampionsOverlay.h"

#import <UIKit/UIKit.h>

static NSString *const CAOverlayCenterXDefaultsKey = @"ChampionsAdvisor.overlay.centerX";
static NSString *const CAOverlayCenterYDefaultsKey = @"ChampionsAdvisor.overlay.centerY";
static CGFloat const CAOverlayButtonSide = 52.0;
static CGFloat const CAOverlayCardWidth = 318.0;

@interface CAOverlayPassthroughWindow : UIWindow
@end

@implementation CAOverlayPassthroughWindow

- (UIView *)hitTest:(CGPoint)point withEvent:(UIEvent *)event {
    UIView *hit = [super hitTest:point withEvent:event];
    if (hit == self || hit == self.rootViewController.view) {
        return nil;
    }
    return hit;
}

@end

static UIWindowScene *CAActiveWindowScene(void) {
    UIWindowScene *fallback = nil;
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if (![scene isKindOfClass:UIWindowScene.class]) {
            continue;
        }
        UIWindowScene *windowScene = (UIWindowScene *)scene;
        if (!fallback) {
            fallback = windowScene;
        }
        if (windowScene.activationState == UISceneActivationStateForegroundActive) {
            return windowScene;
        }
    }
    return fallback;
}

static NSString *CAStringValue(id value) {
    if ([value isKindOfClass:NSString.class]) {
        return value;
    }
    if ([value respondsToSelector:@selector(stringValue)]) {
        return [value stringValue];
    }
    return nil;
}

static NSDictionary *CADictionaryValue(id value) {
    return [value isKindOfClass:NSDictionary.class] ? value : nil;
}

static NSArray *CAArrayValue(id value) {
    return [value isKindOfClass:NSArray.class] ? value : nil;
}

@interface CAOverlayController : UIViewController

@property(nonatomic, copy) NSString *outputDirectory;
@property(nonatomic, strong) NSDictionary *snapshotDocument;
@property(nonatomic, strong) NSDictionary *recommendationDocument;
@property(nonatomic, copy) NSString *fatalError;
@property(nonatomic, strong) UIButton *controlButton;
@property(nonatomic, strong) UIView *statusDot;
@property(nonatomic, strong) UIView *cardView;
@property(nonatomic, strong) UILabel *stateLabel;
@property(nonatomic, strong) UILabel *detailLabel;
@property(nonatomic, strong) UILabel *recommendationLabel;
@property(nonatomic, strong) UILabel *variationLabel;
@property(nonatomic, strong) UILabel *metricsLabel;
@property(nonatomic, strong) NSTimer *refreshTimer;
@property(nonatomic) BOOL cardVisible;

- (void)refreshRecommendation;
- (void)refreshLabels;
- (void)refreshRecommendationAndLabels;

@end

@implementation CAOverlayController

- (void)loadView {
    UIView *root = [[UIView alloc] init];
    root.backgroundColor = UIColor.clearColor;
    self.view = root;

    UIButton *button = [UIButton buttonWithType:UIButtonTypeCustom];
    button.frame = CGRectMake(0.0, 0.0, CAOverlayButtonSide, CAOverlayButtonSide);
    button.backgroundColor = [UIColor colorWithRed:0.07 green:0.09 blue:0.14 alpha:0.90];
    button.layer.cornerRadius = CAOverlayButtonSide / 2.0;
    button.layer.borderWidth = 1.5;
    button.layer.borderColor = [UIColor colorWithWhite:1.0 alpha:0.72].CGColor;
    button.layer.shadowColor = UIColor.blackColor.CGColor;
    button.layer.shadowOpacity = 0.35;
    button.layer.shadowRadius = 5.0;
    button.layer.shadowOffset = CGSizeMake(0.0, 2.0);
    [button setTitle:@"CA" forState:UIControlStateNormal];
    [button setTitleColor:UIColor.whiteColor forState:UIControlStateNormal];
    button.titleLabel.font = [UIFont systemFontOfSize:17.0 weight:UIFontWeightBold];
    [button addTarget:self action:@selector(controlTapped) forControlEvents:UIControlEventTouchUpInside];

    UIPanGestureRecognizer *pan = [[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(controlPanned:)];
    [button addGestureRecognizer:pan];
    [root addSubview:button];
    self.controlButton = button;

    UIView *dot = [[UIView alloc] initWithFrame:CGRectMake(CAOverlayButtonSide - 15.0, 4.0, 10.0, 10.0)];
    dot.layer.cornerRadius = 5.0;
    dot.layer.borderWidth = 1.0;
    dot.layer.borderColor = [UIColor colorWithWhite:0.0 alpha:0.45].CGColor;
    dot.userInteractionEnabled = NO;
    [button addSubview:dot];
    self.statusDot = dot;

    UIView *card = [[UIView alloc] initWithFrame:CGRectZero];
    card.backgroundColor = [UIColor colorWithRed:0.055 green:0.067 blue:0.105 alpha:0.96];
    card.layer.cornerRadius = 16.0;
    card.layer.borderWidth = 1.0;
    card.layer.borderColor = [UIColor colorWithWhite:1.0 alpha:0.18].CGColor;
    card.layer.shadowColor = UIColor.blackColor.CGColor;
    card.layer.shadowOpacity = 0.42;
    card.layer.shadowRadius = 10.0;
    card.layer.shadowOffset = CGSizeMake(0.0, 4.0);
    card.hidden = YES;
    [root addSubview:card];
    self.cardView = card;

    UILabel *title = [[UILabel alloc] init];
    title.text = @"Champions Advisor";
    title.textColor = UIColor.whiteColor;
    title.font = [UIFont systemFontOfSize:17.0 weight:UIFontWeightSemibold];
    [card addSubview:title];

    UILabel *state = [self labelWithSize:14.0 weight:UIFontWeightSemibold color:UIColor.whiteColor];
    [card addSubview:state];
    self.stateLabel = state;

    UILabel *detail = [self labelWithSize:12.0 weight:UIFontWeightRegular color:[UIColor colorWithWhite:0.78 alpha:1.0]];
    [card addSubview:detail];
    self.detailLabel = detail;

    UILabel *recommendation = [self labelWithSize:14.0 weight:UIFontWeightSemibold color:[UIColor colorWithRed:0.50 green:0.82 blue:1.0 alpha:1.0]];
    [card addSubview:recommendation];
    self.recommendationLabel = recommendation;

    UILabel *variation = [self labelWithSize:11.0 weight:UIFontWeightMedium color:[UIColor colorWithWhite:0.82 alpha:1.0]];
    [card addSubview:variation];
    self.variationLabel = variation;

    UILabel *metrics = [self labelWithSize:11.0 weight:UIFontWeightRegular color:[UIColor colorWithWhite:0.62 alpha:1.0]];
    [card addSubview:metrics];
    self.metricsLabel = metrics;

    title.frame = CGRectMake(16.0, 13.0, CAOverlayCardWidth - 32.0, 21.0);
    state.frame = CGRectMake(16.0, 42.0, CAOverlayCardWidth - 32.0, 19.0);
    detail.frame = CGRectMake(16.0, 65.0, CAOverlayCardWidth - 32.0, 38.0);
    recommendation.frame = CGRectMake(16.0, 109.0, CAOverlayCardWidth - 32.0, 39.0);
    variation.frame = CGRectMake(16.0, 152.0, CAOverlayCardWidth - 32.0, 61.0);
    metrics.frame = CGRectMake(16.0, 217.0, CAOverlayCardWidth - 32.0, 31.0);

    [self restoreButtonCenter];
    [self refreshLabels];
}

- (UILabel *)labelWithSize:(CGFloat)size weight:(UIFontWeight)weight color:(UIColor *)color {
    UILabel *label = [[UILabel alloc] init];
    label.textColor = color;
    label.font = [UIFont systemFontOfSize:size weight:weight];
    label.numberOfLines = 0;
    label.lineBreakMode = NSLineBreakByTruncatingTail;
    return label;
}

- (void)viewDidAppear:(BOOL)animated {
    [super viewDidAppear:animated];
    [self restoreButtonCenter];
    [self layoutCard];
}

- (void)viewDidLayoutSubviews {
    [super viewDidLayoutSubviews];
    self.controlButton.center = [self clampedButtonCenter:self.controlButton.center];
    [self layoutCard];
}

- (CGPoint)defaultButtonCenter {
    CGRect bounds = self.view.bounds;
    return CGPointMake(CGRectGetWidth(bounds) - CAOverlayButtonSide / 2.0 - 12.0,
                       CGRectGetMidY(bounds));
}

- (CGPoint)clampedButtonCenter:(CGPoint)center {
    UIEdgeInsets insets = self.view.safeAreaInsets;
    CGFloat half = CAOverlayButtonSide / 2.0;
    CGFloat minX = insets.left + half + 6.0;
    CGFloat maxX = CGRectGetWidth(self.view.bounds) - insets.right - half - 6.0;
    CGFloat minY = insets.top + half + 6.0;
    CGFloat maxY = CGRectGetHeight(self.view.bounds) - insets.bottom - half - 6.0;
    if (maxX < minX || maxY < minY) {
        return [self defaultButtonCenter];
    }
    return CGPointMake(MAX(minX, MIN(maxX, center.x)), MAX(minY, MIN(maxY, center.y)));
}

- (void)restoreButtonCenter {
    NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
    if ([defaults objectForKey:CAOverlayCenterXDefaultsKey] && [defaults objectForKey:CAOverlayCenterYDefaultsKey]) {
        CGPoint stored = CGPointMake([defaults doubleForKey:CAOverlayCenterXDefaultsKey],
                                     [defaults doubleForKey:CAOverlayCenterYDefaultsKey]);
        self.controlButton.center = [self clampedButtonCenter:stored];
    } else {
        self.controlButton.center = [self clampedButtonCenter:[self defaultButtonCenter]];
    }
}

- (void)saveButtonCenter {
    NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
    [defaults setDouble:self.controlButton.center.x forKey:CAOverlayCenterXDefaultsKey];
    [defaults setDouble:self.controlButton.center.y forKey:CAOverlayCenterYDefaultsKey];
}

- (void)controlTapped {
    self.cardVisible = !self.cardVisible;
    self.cardView.hidden = !self.cardVisible;
    if (self.cardVisible) {
        [self refreshRecommendation];
        [self refreshLabels];
        [self layoutCard];
    }
}

- (void)controlPanned:(UIPanGestureRecognizer *)pan {
    CGPoint translation = [pan translationInView:self.view];
    self.controlButton.center = CGPointMake(self.controlButton.center.x + translation.x,
                                            self.controlButton.center.y + translation.y);
    [pan setTranslation:CGPointZero inView:self.view];
    [self layoutCard];
    if (pan.state == UIGestureRecognizerStateEnded || pan.state == UIGestureRecognizerStateCancelled) {
        self.controlButton.center = [self clampedButtonCenter:self.controlButton.center];
        [self saveButtonCenter];
        [self layoutCard];
    }
}

- (void)layoutCard {
    if (!self.cardView || !self.controlButton) {
        return;
    }
    CGRect bounds = self.view.bounds;
    UIEdgeInsets insets = self.view.safeAreaInsets;
    CGFloat cardHeight = 260.0;
    CGFloat horizontalMargin = MAX(10.0, insets.left + 6.0);
    CGFloat rightMargin = MAX(10.0, insets.right + 6.0);
    CGFloat x;
    if (self.controlButton.center.x > CGRectGetMidX(bounds)) {
        x = CGRectGetMinX(self.controlButton.frame) - CAOverlayCardWidth - 10.0;
    } else {
        x = CGRectGetMaxX(self.controlButton.frame) + 10.0;
    }
    x = MAX(horizontalMargin, MIN(CGRectGetWidth(bounds) - rightMargin - CAOverlayCardWidth, x));
    CGFloat y = self.controlButton.center.y - cardHeight / 2.0;
    CGFloat minY = MAX(8.0, insets.top + 6.0);
    CGFloat maxY = CGRectGetHeight(bounds) - MAX(8.0, insets.bottom + 6.0) - cardHeight;
    y = MAX(minY, MIN(maxY, y));
    self.cardView.frame = CGRectMake(x, y, CAOverlayCardWidth, cardHeight);
}

- (void)refreshRecommendation {
    if (self.outputDirectory.length == 0) {
        return;
    }
    NSString *path = [self.outputDirectory stringByAppendingPathComponent:@"recommendation.json"];
    NSData *data = [NSData dataWithContentsOfFile:path options:0 error:nil];
    if (!data) {
        self.recommendationDocument = nil;
        return;
    }
    id object = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    self.recommendationDocument = CADictionaryValue(object);
}

- (void)refreshLabels {
    if (!self.isViewLoaded) {
        return;
    }
    if (self.fatalError.length > 0) {
        self.statusDot.backgroundColor = [UIColor colorWithRed:0.95 green:0.25 blue:0.25 alpha:1.0];
        self.stateLabel.text = @"Capture disabled";
        self.detailLabel.text = self.fatalError;
        self.recommendationLabel.text = @"No engine request will be sent.";
        self.variationLabel.text = @"PV: unavailable";
        self.metricsLabel.text = @"The version lock prevented unsafe offset access.";
        return;
    }

    NSDictionary *state = CADictionaryValue(self.snapshotDocument[@"state"]);
    BOOL available = [state[@"available"] boolValue];
    NSString *hash = CAStringValue(self.snapshotDocument[@"state_hash"]);
    NSDictionary *world = CADictionaryValue(state[@"world"]);
    NSNumber *turn = world[@"elapsed_turns"];
    NSArray *teams = CAArrayValue(state[@"teams"]);
    NSDictionary *observability = CADictionaryValue(state[@"opponent_observability"]);

    if (!self.snapshotDocument) {
        self.statusDot.backgroundColor = [UIColor colorWithRed:0.98 green:0.68 blue:0.16 alpha:1.0];
        self.stateLabel.text = @"Waiting for game state";
        self.detailLabel.text = @"The passive probe is starting.";
    } else if (!available) {
        self.statusDot.backgroundColor = [UIColor colorWithRed:0.55 green:0.62 blue:0.72 alpha:1.0];
        self.stateLabel.text = @"No battle active";
        self.detailLabel.text = hash.length >= 8
            ? [NSString stringWithFormat:@"Snapshot %@ · capture ready", [hash substringToIndex:8]]
            : @"Capture ready";
    } else {
        self.statusDot.backgroundColor = [UIColor colorWithRed:0.22 green:0.84 blue:0.46 alpha:1.0];
        self.stateLabel.text = [NSString stringWithFormat:@"Battle captured · turn %@", turn ?: @0];
        self.detailLabel.text = [NSString stringWithFormat:@"%lu teams · %@ opposing Pokémon · snapshot %@",
                                 (unsigned long)teams.count,
                                 observability[@"remote_pokemon"] ?: @0,
                                 hash.length >= 8 ? [hash substringToIndex:8] : @"unknown"];
    }

    NSDictionary *recommendation = self.recommendationDocument;
    NSString *recommendationHash = CAStringValue(recommendation[@"state_hash"]);
    NSString *status = CAStringValue(recommendation[@"status"]);
    BOOL fresh = hash.length > 0 && [recommendationHash isEqualToString:hash];
    if (!recommendation) {
        self.recommendationLabel.text = @"Mac engine: no result yet";
        self.variationLabel.text = @"PV: —";
        self.metricsLabel.text = @"Results appear only after the matching snapshot is analyzed.";
    } else if (!fresh) {
        self.recommendationLabel.text = @"Mac engine: stale result ignored";
        self.variationLabel.text = @"PV: waiting for matching state";
        self.metricsLabel.text = @"The result hash does not match the current board state.";
    } else if ([status isEqualToString:@"calculating"]) {
        self.statusDot.backgroundColor = [UIColor colorWithRed:0.31 green:0.70 blue:1.0 alpha:1.0];
        NSString *summary = CAStringValue(recommendation[@"summary"]);
        NSNumber *activeDepth = recommendation[@"active_depth"];
        NSNumber *targetDepth = recommendation[@"target_depth"];
        NSNumber *completedPlans = recommendation[@"root_plans_completed"];
        NSNumber *totalPlans = recommendation[@"root_plans_total"];
        NSNumber *nodes = recommendation[@"nodes"];
        NSNumber *elapsedMs = recommendation[@"elapsed_ms"];
        self.recommendationLabel.text = summary.length > 0
            ? summary
            : @"Mac engine: calculating exact branches";
        self.variationLabel.text = totalPlans.integerValue > 0
            ? [NSString stringWithFormat:@"Root plans %@/%@ · depth %@/%@",
                                        completedPlans ?: @0,
                                        totalPlans,
                                        activeDepth ?: @1,
                                        targetDepth ?: @"–"]
            : @"Building the exact battle state on the Mac…";
        self.metricsLabel.text = [NSString stringWithFormat:@"%@ nodes · %@ ms · live hash matched",
                                  nodes ?: @0,
                                  elapsedMs ?: @0];
    } else {
        NSString *summary = CAStringValue(recommendation[@"summary"]);
        NSDictionary *bestPlan = CADictionaryValue(recommendation[@"best_plan"]);
        NSString *planLabel = CAStringValue(bestPlan[@"label"]);
        self.recommendationLabel.text = summary.length > 0 ? summary
            : (planLabel.length > 0 ? planLabel : [NSString stringWithFormat:@"Mac engine: %@", status ?: @"result ready"]);

        NSArray *variation = CAArrayValue(recommendation[@"principal_variation"]);
        NSMutableArray<NSString *> *variationLines = [NSMutableArray array];
        NSUInteger shown = MIN((NSUInteger)2, variation.count);
        for (NSUInteger index = 0; index < shown; ++index) {
            NSDictionary *step = CADictionaryValue(variation[index]);
            NSDictionary *perspectivePlan = CADictionaryValue(step[@"perspective_plan"]);
            NSString *label = CAStringValue(perspectivePlan[@"label"]);
            if (label.length > 0) {
                [variationLines addObject:[NSString stringWithFormat:@"%lu. %@", (unsigned long)(index + 1), label]];
            }
        }
        self.variationLabel.text = variationLines.count > 0
            ? [NSString stringWithFormat:@"PV\n%@", [variationLines componentsJoinedByString:@"\n"]]
            : @"PV: not available for this engine status";

        NSNumber *depth = recommendation[@"depth"];
        NSNumber *nodes = recommendation[@"nodes"];
        NSNumber *elapsedMs = recommendation[@"elapsed_ms"];
        self.metricsLabel.text = [NSString stringWithFormat:@"depth %@ · %@ nodes · %@ ms · hash matched",
                                  depth ?: @"–", nodes ?: @"–", elapsedMs ?: @"–"];
    }
}

- (void)dealloc {
    [self.refreshTimer invalidate];
}

- (void)refreshRecommendationAndLabels {
    if (UIApplication.sharedApplication.applicationState != UIApplicationStateActive) {
        return;
    }
    [self refreshRecommendation];
    [self refreshLabels];
}

@end

static CAOverlayPassthroughWindow *CAOverlayWindow;
static CAOverlayController *CAOverlayViewController;
static NSString *CAOverlayOutputDirectory;
static NSDictionary *CAOverlayPendingSnapshot;
static NSString *CAOverlayPendingError;

static void CAEnsureOverlayWindow(void) {
    UIWindowScene *scene = CAActiveWindowScene();
    if (!scene) {
        return;
    }
    if (CAOverlayWindow && CAOverlayWindow.windowScene == scene) {
        CAOverlayWindow.frame = scene.coordinateSpace.bounds;
        CAOverlayWindow.hidden = NO;
        return;
    }

    CAOverlayWindow.hidden = YES;
    CAOverlayWindow = [[CAOverlayPassthroughWindow alloc] initWithWindowScene:scene];
    CAOverlayWindow.frame = scene.coordinateSpace.bounds;
    CAOverlayWindow.windowLevel = UIWindowLevelAlert + 40.0;
    CAOverlayWindow.backgroundColor = UIColor.clearColor;

    CAOverlayViewController = [[CAOverlayController alloc] init];
    CAOverlayViewController.outputDirectory = CAOverlayOutputDirectory;
    CAOverlayViewController.snapshotDocument = CAOverlayPendingSnapshot;
    CAOverlayViewController.fatalError = CAOverlayPendingError;
    CAOverlayWindow.rootViewController = CAOverlayViewController;
    CAOverlayWindow.hidden = NO;

    [CAOverlayViewController refreshRecommendation];
    [CAOverlayViewController refreshLabels];
    CAOverlayViewController.refreshTimer = [NSTimer scheduledTimerWithTimeInterval:1.0
                                                                          target:CAOverlayViewController
                                                                        selector:@selector(refreshRecommendationAndLabels)
                                                                        userInfo:nil
                                                                         repeats:YES];
}

void ChampionsAdvisorOverlayStart(NSString *outputDirectory) {
    CAOverlayOutputDirectory = [outputDirectory copy];
    dispatch_async(dispatch_get_main_queue(), ^{
        [NSNotificationCenter.defaultCenter addObserverForName:UIApplicationDidBecomeActiveNotification
                                                        object:nil
                                                         queue:NSOperationQueue.mainQueue
                                                    usingBlock:^(__unused NSNotification *notification) {
            CAEnsureOverlayWindow();
        }];
        CAEnsureOverlayWindow();
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
            CAEnsureOverlayWindow();
        });
    });
}

void ChampionsAdvisorOverlayUpdateSnapshot(NSDictionary *document) {
    CAOverlayPendingSnapshot = [document copy];
    dispatch_async(dispatch_get_main_queue(), ^{
        CAEnsureOverlayWindow();
        CAOverlayViewController.snapshotDocument = CAOverlayPendingSnapshot;
        [CAOverlayViewController refreshRecommendation];
        [CAOverlayViewController refreshLabels];
    });
}

void ChampionsAdvisorOverlaySetError(NSString *message) {
    CAOverlayPendingError = [message copy];
    dispatch_async(dispatch_get_main_queue(), ^{
        CAEnsureOverlayWindow();
        CAOverlayViewController.fatalError = CAOverlayPendingError;
        [CAOverlayViewController refreshLabels];
    });
}
