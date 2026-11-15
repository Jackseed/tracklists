#!/bin/sh
# Builds the iOS app for App Store Connect / TestFlight: .build-ios/export/App.ipa
# Run `npm run mobile:staging` (or mobile:prod) first. Signing is automatic for
# the team set in the Xcode project; Xcode must be signed in to that Apple account.
# Each run gets a new build number (yyyymmddHHMM), as App Store Connect requires.
set -e
cd "$(dirname "$0")/.."
ROOT=$PWD
BUILD=$(date +%Y%m%d%H%M)
rm -rf .build-ios/Tracklists.xcarchive .build-ios/export
# Archived unsigned: automatic development signing would need a registered device.
xcodebuild archive -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath .build-ios/Tracklists.xcarchive \
  -derivedDataPath .build-ios -scmProvider system CODE_SIGNING_ALLOWED=NO CURRENT_PROJECT_VERSION="$BUILD" -quiet
# Signed here, with an App Store distribution certificate and profile.
xcodebuild -exportArchive -archivePath .build-ios/Tracklists.xcarchive \
  -exportOptionsPlist ios/ExportOptions.plist -exportPath .build-ios/export -allowProvisioningUpdates -quiet
echo "Build $BUILD: $ROOT/.build-ios/export/App.ipa"
