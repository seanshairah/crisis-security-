package zw.co.crisis.security.patrol

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import zw.co.crisis.security.R
import zw.co.crisis.security.net.ApiClient
import zw.co.crisis.security.ui.MainActivity

class PatrolRuntime(private val context: Context) {
    private val store = PatrolStore.get(context)
    /** Called by the existing foreground service, so alerts continue while the screen is closed. */
    fun tick() {
        if (!androidx.core.app.NotificationManagerCompat.from(context).areNotificationsEnabled()) return
        val session = store.config()?.optJSONObject("session") ?: return
        val now = System.currentTimeMillis()
        if (now >= PatrolStore.time(session.getString("expiresAt"))) return
        val assignments = session.optJSONArray("assignments") ?: return
        for (i in 0 until assignments.length()) {
            val a = assignments.getJSONObject(i)
            if (a.optString("status") == "COMPLETED" || store.hasScan(a.getString("id"))) continue
            if (!PatrolWindows.isOpen(now, PatrolStore.time(a.getString("dueAt")), PatrolStore.time(a.getString("expiresAt")), PatrolStore.time(session.getString("expiresAt")))) continue
            if (!store.promptOnce(a.getString("id"))) continue
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel("crisis_patrol", "Patrol prompts", NotificationManager.IMPORTANCE_HIGH))
            val open = PendingIntent.getActivity(context, 300, Intent(context, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val n = NotificationCompat.Builder(context, "crisis_patrol").setSmallIcon(R.drawable.ic_shield).setContentTitle("Patrol due · ${a.getString("checkpointName")}").setContentText("${session.getString("guardName")} · scan the assigned QR checkpoint").setContentIntent(open).setAutoCancel(true).setPriority(NotificationCompat.PRIORITY_HIGH).build()
            nm.notify(a.getString("id").hashCode(), n)
        }
    }
    /** Missing acknowledgements and network errors retain every row. Rejections remain reviewable. */
    fun sync(api: ApiClient) {
        try { syncRows(api); store.setMeta("lastError",null) }
        catch(e: Exception) { store.setMeta("lastError","unreachable"); throw e }
        finally { PatrolFeedback.confirmed(context) }
    }
    private fun syncRows(api: ApiClient) {
        val events = store.pending()
        if (events.isNotEmpty()) {
            val body = JSONArray(); events.forEach { body.put(it) }
            val acks = api.patrolEvents(body).optJSONArray("acks") ?: JSONArray()
            val sent = events.map { it.getString("eventId") }.toSet()
            for (i in 0 until acks.length()) {
                val a = acks.getJSONObject(i); val id = a.optString("eventId")
                if (id !in sent) continue
                when (a.optString("status")) {
                    "ok", "duplicate" -> store.ack(id, "RECEIVED", a.optString("decision"))
                    "rejected" -> store.ack(id, "REJECTED", a.optString("error"))
                }
            }
        }
        store.saveConfig(api.patrolConfig())
        store.setMeta("lastSyncAt",System.currentTimeMillis().toString())
        tick()
    }
}
