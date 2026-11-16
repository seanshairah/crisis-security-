package zw.co.crisis.security

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import zw.co.crisis.security.data.Prefs
import zw.co.crisis.security.service.GatewayService
import zw.co.crisis.security.service.SyncWorker

/** After a reboot (or app update) bring the gateway service back so heartbeats and call monitoring resume. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_LOCKED_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, "android.intent.action.QUICKBOOT_POWERON")) return
        if (!Prefs(context).isActivated) return
        GatewayService.start(context)
        SyncWorker.schedule(context)
    }
}
