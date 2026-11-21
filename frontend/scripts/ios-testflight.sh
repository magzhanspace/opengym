#!/usr/bin/env bash
# Builds the iPhone app and sends it to TestFlight: the mobile web build, an archive signed by hand,
# the export for App Store Connect, the upload. Run it on the Mac that holds the Apple Distribution
# certificate (its private key in the login keychain) and the two provisioning profiles.
#
#   frontend/scripts/ios-testflight.sh            build, archive, export and upload
#   frontend/scripts/ios-testflight.sh --no-upload   stop after the .ipa (build/ios/export/App.ipa)
#
# Signing (ios/App/Signing.xcconfig holds the defaults; the environment wins):
#   OPENGYM_TEAM_ID          Team ID of the developer account that signs (10 characters)
#   OPENGYM_APP_PROFILE      name of the App Store Connect profile for dev.magjan.gym
#   OPENGYM_WIDGETS_PROFILE  name of the App Store Connect profile for dev.magjan.gym.widgets
#   OPENGYM_PROFILES_DIR     optional: a folder of .mobileprovision files to install first
#   OPENGYM_BUILD_NUMBER     optional: the build number (default: the date and time, yymmddHHMM)
#
# Upload, one of:
#   ASC_KEY_ID + ASC_ISSUER_ID   an App Store Connect API key; the .p8 file sits in
#                                ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8
#                                (or in the folder ASC_KEY_DIR names)
#   ASC_APPLE_ID + ASC_APP_PASSWORD   an Apple ID with access to the app and an app-specific
#                                password for it (appleid.apple.com → Sign-In and Security)
#
# Secrets are never printed: the password goes to altool as @env:ASC_APP_PASSWORD, and nothing
# here runs with `set -x`.
set -euo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # CocoaPods refuses to run under a non-UTF-8 locale

UPLOAD=1
for arg in "$@"; do
  case "$arg" in
    --no-upload) UPLOAD=0 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

FRONTEND="$(cd "$(dirname "$0")/.." && pwd)"
IOS="$FRONTEND/ios/App"
OUT="$FRONTEND/build/ios"
XCCONFIG="$IOS/Signing.xcconfig"

from_xcconfig() { sed -n "s/^$1 *= *//p" "$XCCONFIG" | sed 's/[[:space:]]*$//'; }
TEAM="${OPENGYM_TEAM_ID:-$(from_xcconfig OPENGYM_TEAM_ID)}"
APP_PROFILE="${OPENGYM_APP_PROFILE:-$(from_xcconfig OPENGYM_APP_PROFILE)}"
WIDGETS_PROFILE="${OPENGYM_WIDGETS_PROFILE:-$(from_xcconfig OPENGYM_WIDGETS_PROFILE)}"
BUILD_NUMBER="${OPENGYM_BUILD_NUMBER:-$(date +%y%m%d%H%M)}"

fail() { echo "✗ $*" >&2; exit 1; }
[[ "$TEAM" =~ ^[A-Z0-9]{10}$ ]] || fail "No Team ID: set OPENGYM_TEAM_ID or fill it in ios/App/Signing.xcconfig."
[[ -n "$APP_PROFILE" ]] || fail "No profile for dev.magjan.gym: set OPENGYM_APP_PROFILE."
[[ -n "$WIDGETS_PROFILE" ]] || fail "No profile for dev.magjan.gym.widgets: set OPENGYM_WIDGETS_PROFILE."
[[ "$BUILD_NUMBER" =~ ^[0-9]+(\.[0-9]+)*$ ]] || fail "OPENGYM_BUILD_NUMBER must be digits and dots."
if [[ $UPLOAD == 1 ]]; then
  if [[ -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" ]]; then AUTH=key
  elif [[ -n "${ASC_APPLE_ID:-}" && -n "${ASC_APP_PASSWORD:-}" ]]; then AUTH=password
  else fail "No upload credentials: set ASC_KEY_ID and ASC_ISSUER_ID, or ASC_APPLE_ID and ASC_APP_PASSWORD (or pass --no-upload)."
  fi
fi

security find-identity -v -p codesigning | grep -q "Apple Distribution" \
  || fail "No Apple Distribution certificate with its private key in the keychain."

# Profiles handed over as files: where Xcode looks for them (both the old and the Xcode 16+ folder).
if [[ -n "${OPENGYM_PROFILES_DIR:-}" ]]; then
  for dir in "$HOME/Library/MobileDevice/Provisioning Profiles" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"; do
    mkdir -p "$dir"
    cp "$OPENGYM_PROFILES_DIR"/*.mobileprovision "$dir"/
  done
  echo "Installed the profiles from $OPENGYM_PROFILES_DIR"
fi

echo "→ Mobile web build (180 px exercise media only)"
# APP_MEDIA_DIR and VITE_CLIP_EXT would bring the larger animations of upstream's release machine:
# this app ships the 180 px files from catalogue/media only (CLAUDE.md, exercise media licence).
(cd "$FRONTEND" && env -u APP_MEDIA_DIR -u VITE_CLIP_EXT npm run build:mobile)

rm -rf "$OUT"
mkdir -p "$OUT"
SIGNING=(OPENGYM_TEAM_ID="$TEAM" OPENGYM_APP_PROFILE="$APP_PROFILE" OPENGYM_WIDGETS_PROFILE="$WIDGETS_PROFILE")

echo "→ Archive (build $BUILD_NUMBER)"
xcodebuild -quiet -workspace "$IOS/App.xcworkspace" -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$OUT/App.xcarchive" \
  "${SIGNING[@]}" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" archive

echo "→ Export"
cp "$IOS/ExportOptions.plist" "$OUT/ExportOptions.plist"
/usr/libexec/PlistBuddy -c "Set :teamID $TEAM" \
  -c "Set :provisioningProfiles:dev.magjan.gym $APP_PROFILE" \
  -c "Set :provisioningProfiles:dev.magjan.gym.widgets $WIDGETS_PROFILE" "$OUT/ExportOptions.plist"
xcodebuild -quiet -exportArchive -archivePath "$OUT/App.xcarchive" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" -exportPath "$OUT/export"
IPA="$(ls "$OUT"/export/*.ipa | head -1)"
echo "Built $IPA"

[[ $UPLOAD == 1 ]] || exit 0
echo "→ Upload to App Store Connect"
if [[ $AUTH == key ]]; then
  [[ -n "${ASC_KEY_DIR:-}" ]] && export API_PRIVATE_KEYS_DIR="$ASC_KEY_DIR"
  xcrun altool --upload-app -f "$IPA" -t ios --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
else
  xcrun altool --upload-app -f "$IPA" -t ios -u "$ASC_APPLE_ID" -p @env:ASC_APP_PASSWORD
fi
echo "Uploaded build $BUILD_NUMBER. TestFlight shows it once App Store Connect has processed it."
