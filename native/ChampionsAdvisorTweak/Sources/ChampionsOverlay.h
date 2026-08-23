#import <Foundation/Foundation.h>

#ifdef __cplusplus
extern "C" {
#endif

void ChampionsAdvisorOverlayStart(NSString *outputDirectory);
void ChampionsAdvisorOverlayUpdateSnapshot(NSDictionary *document);
void ChampionsAdvisorOverlaySetError(NSString *message);

#ifdef __cplusplus
}
#endif
