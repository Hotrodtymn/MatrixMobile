package expo.modules.heymatrix

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HeyMatrixModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HeyMatrix")
    Function("getState") { HeyMatrixRuntime.snapshot() }
    OnActivityEntersBackground {
      VoiceCommandCycle.hostReady = false
      VoiceCommandCycle.active?.checkHost()
    }
    OnDestroy {
      VoiceCommandCycle.hostReady = false
      VoiceCommandCycle.active?.checkHost()
    }
    AsyncFunction("setHostReady") { ready: Boolean ->
      val activity = appContext.currentActivity
      VoiceCommandCycle.hostReady = ready && activity != null && !activity.isFinishing && activity.hasWindowFocus()
      VoiceCommandCycle.heartbeat = android.os.SystemClock.elapsedRealtime()
      VoiceCommandCycle.active?.checkHost()
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
    AsyncFunction("takeVoiceRequest") { VoiceCommandCycle.active?.takeRequest() }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
    AsyncFunction("parsedReminder") { id: String, title: String, date: String, readback: String ->
      VoiceCommandCycle.active?.parsed(id, title, date, readback)
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
    AsyncFunction("rejectVoiceCommand") { id: String, reason: String? -> VoiceCommandCycle.active?.reject(id, reason ?: "AMBIGUOUS_REMINDER") }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
    AsyncFunction("isSaveAuthorized") { id: String -> VoiceCommandCycle.active?.authorized(id) == true }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
    AsyncFunction("voiceSaved") { id: String, ok: Boolean -> VoiceCommandCycle.active?.saved(id, ok) }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
    AsyncFunction("canStartListening") {
      val activity = appContext.currentActivity
      activity != null && !activity.isFinishing && !activity.isDestroyed && activity.hasWindowFocus()
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
    AsyncFunction("testTone") { HeyMatrixService.testTone() }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
    AsyncFunction("startListening") {
      check(Build.VERSION.SDK_INT >= 29) { "Hey Matrix requires Android 10 or newer; push-to-talk remains available." }
      check(!HeyMatrixRuntime.occupied) { "Hey Matrix is still active or releasing the microphone. Stop it before restarting." }
      val context = appContext.reactContext ?: error("Matrix is not available.")
      val activity = appContext.currentActivity ?: error("Open Matrix before enabling listening.")
      check(!activity.isFinishing && activity.hasWindowFocus()) { "Enable Hey Matrix while Matrix is visible, after closing permission dialogs." }
      check(ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { "Microphone permission is required." }
      if (Build.VERSION.SDK_INT >= 33) check(ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) { "Allow notifications so Stop Listening remains visible." }
      val manager = context.getSystemService(NotificationManager::class.java)
      check(manager.areNotificationsEnabled()) { "Enable Matrix notifications first." }
      check(manager.getNotificationChannel(HeyMatrixService.CHANNEL)?.importance != NotificationManager.IMPORTANCE_NONE) { "Enable the Hey Matrix notification channel first." }
      if (HeyMatrixRuntime.state == "stopped" || HeyMatrixRuntime.state == "error") {
        HeyMatrixRuntime.diagnostics.begin()
        HeyMatrixRuntime.log("start_requested visible_activity=true")
        HeyMatrixRuntime.occupied = true
        HeyMatrixRuntime.update("starting", "Starting on-device listening…")
        try { ContextCompat.startForegroundService(context, Intent(context, HeyMatrixService::class.java)) }
        catch (error: Exception) { HeyMatrixRuntime.diagnostics.error("START_BLOCKED"); HeyMatrixRuntime.log("service_start_blocked"); HeyMatrixRuntime.occupied = false; HeyMatrixRuntime.update("error", error.message ?: "Android blocked microphone service startup."); throw error }
      }
      HeyMatrixRuntime.snapshot()
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
    AsyncFunction("stopListening") {
      appContext.reactContext?.let { HeyMatrixService.stop(it) }
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
  }
}
