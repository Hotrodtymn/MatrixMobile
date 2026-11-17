const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');
const SERVICE = 'expo.modules.heymatrix.HeyMatrixService';
const STOP = 'expo.modules.heymatrix.StopListeningReceiver';
module.exports = function withHeyMatrix(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.RECORD_AUDIO', 'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_MICROPHONE', 'android.permission.POST_NOTIFICATIONS',
    'android.permission.WAKE_LOCK',
  ]);
  return withAndroidManifest(config, mod => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    app.service = (app.service || []).filter(x => x.$['android:name'] !== SERVICE);
    app.service.push({ $: { 'android:name': SERVICE, 'android:exported': 'false',
      'android:foregroundServiceType': 'microphone', 'android:stopWithTask': 'false' } });
    app.receiver = (app.receiver || []).filter(x => x.$['android:name'] !== STOP);
    app.receiver.push({ $: { 'android:name': STOP, 'android:exported': 'false' } });
    return mod;
  });
};
