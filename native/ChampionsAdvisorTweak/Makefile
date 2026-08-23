ARCHS = arm64 arm64e
TARGET := iphone:clang:16.5:16.0
THEOS_PACKAGE_SCHEME = rootless
INSTALL_TARGET_PROCESSES = PokmonChampions

include $(THEOS)/makefiles/common.mk

TWEAK_NAME = ChampionsAdvisorProbe
ChampionsAdvisorProbe_FILES = Sources/ChampionsProbe.xm Sources/ChampionsOverlay.m
ChampionsAdvisorProbe_FRAMEWORKS = Foundation UIKit
ChampionsAdvisorProbe_CFLAGS = -fobjc-arc
ChampionsAdvisorProbe_CCFLAGS = -std=c++17

include $(THEOS_MAKE_PATH)/tweak.mk
