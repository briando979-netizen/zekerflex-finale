# ZekerFlex Mobile Platform Setup

Professional mobile experience with PWA, iOS, Android, offline support, and native features.

## Installation

### PWA & Web (All platforms)

```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/camera @capacitor/geolocation @capacitor/contacts
npm install @capacitor/calendar @capacitor/haptics @capacitor/app
npm install @capacitor-community/biometric-auth @capacitor-community/secure-storage-plugin
npm install @capacitor-community/barcode-scanner
npm install idb
```

### iOS Setup

```bash
npx cap add ios
cd ios
pod install
cd ..
```

Update `ios/App/App/Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>We need camera access for photos and videos</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>We need location for job matching</string>
<key>NSContactsUsageDescription</key>
<string>We need access to your contacts</string>
<key>NSCalendarsUsageDescription</key>
<string>We need calendar access for scheduling</string>
```

### Android Setup

```bash
npx cap add android
cd android
./gradlew clean
cd ..
```

Update `android/app/build.gradle`:

```gradle
android {
    compileSdkVersion 34
    minSdkVersion 24
    targetSdkVersion 34
}

dependencies {
    implementation 'com.google.android.material:material:1.9.0'
}
```

Update `android/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.READ_CONTACTS" />
<uses-permission android:name="android.permission.READ_CALENDAR" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.NFC" />
```

## Development

### Local Testing

```bash
# Web (PWA)
npm run dev

# iOS Simulator
npx cap open ios

# Android Emulator
npx cap open android

# Sync Capacitor changes
npx cap sync
```

### Building

```bash
# Web build
npm run build

# Sync to native platforms
npx cap sync

# iOS: Open in Xcode
npx cap open ios

# Android: Open in Android Studio
npx cap open android
```

## Features

### PWA
- Offline mode with full sync
- Background sync (every 24h)
- Rich push notifications
- App installation prompt
- Native-like UX

### Native Features
- Camera (photo/video)
- Geolocation (high accuracy)
- Contacts access
- Calendar integration
- NFC/QR scanning
- Biometric auth (Face ID, Touch ID)
- Haptic feedback
- Secure storage

### Deep Linking
- Universal Links (iOS)
- App Links (Android)
- QR code support
- Referral tracking

### Analytics
- Crash reporting
- Session tracking
- Feature usage
- Performance metrics
- Custom events

### Offline
- Local sync queue
- Conflict resolution
- Automatic retry (exponential backoff)
- Data compression

## Performance Targets

- Lighthouse: 95+
- First Load: < 2s
- App Start: < 1s
- First Contentful Paint: < 1.5s
- Core Web Vitals: All green

## Security

- Biometric authentication
- Secure storage for sensitive data
- HTTPS only
- Certificate pinning (optional)
- API key protection

## Deployment

### iOS App Store
1. Create App Store Connect account
2. Create bundle ID: `com.zekerflex.app`
3. Generate certificates in Xcode
4. Update signing in `ios/App/App.xcodeproj`
5. Build archive: Product → Archive
6. Upload to App Store Connect

### Android Play Store
1. Create Google Play Developer account
2. Generate signing key
3. Update `android/app/build.gradle` with signing config
4. Build release APK/AAB
5. Upload to Google Play Console

### PWA Deployment
- Deploy to production server
- Service Worker automatically served
- Analytics tracked to `/api/analytics`

## Monitoring

### Crash Reports
- View at `/api/mobile/analytics/crashes`
- Severity levels: low, medium, high, critical
- Auto-alerts for critical crashes

### Performance
- Monitor Core Web Vitals
- Track long tasks
- Monitor memory usage
- Measure FPS

### Engagement
- Session duration
- Feature usage
- Conversion tracking
- User retention

## Troubleshooting

### PWA not installing
- Check manifest.json
- Ensure HTTPS
- Verify service worker registration
- Check browser support

### Native features not working
- Verify permissions in manifest/Info.plist
- Check Capacitor plugin versions
- Ensure device supports feature (e.g., NFC)
- Check simulator/emulator support

### Deep links not working
- Verify URL scheme registration
- Check apple-app-site-association (iOS)
- Check assetlinks.json (Android)
- Test with `adb shell am start` (Android)

### Performance issues
- Check bundle size
- Profile with DevTools
- Optimize images (WebP, AVIF)
- Lazy load non-critical resources
- Use code splitting

## Resources

- [Capacitor Docs](https://capacitorjs.com)
- [PWA Docs](https://web.dev/progressive-web-apps/)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
