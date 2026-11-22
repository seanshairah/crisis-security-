package zw.co.crisis.security.ui

import android.content.Intent
import android.os.Bundle
import android.widget.FrameLayout
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import zw.co.crisis.security.data.Prefs
import zw.co.crisis.security.net.ApiClient
import zw.co.crisis.security.patrol.PatrolMessages
import zw.co.crisis.security.patrol.PatrolRuntime
import zw.co.crisis.security.patrol.PatrolStore
import zw.co.crisis.security.service.GatewayService
import zw.co.crisis.security.service.SyncEngine
import zw.co.crisis.security.service.Trigger
import zw.co.crisis.security.util.DeviceInfo
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Patrol tab: this shift on this phone. Send everything now, end the shift and hand the phone over, fix what blocks scans. */
class PatrolSessionActivity : AppCompatActivity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var chrome: GuardChrome
    private lateinit var holder: FrameLayout
    private lateinit var prefs: Prefs
    private lateinit var store: PatrolStore
    private var message: String? = null
    private var busy = false
    private var fixActions: List<() -> Unit> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this); store = PatrolStore.get(this)
        holder = FrameLayout(this)
        chrome = GuardChrome.install(this, holder, GuardChrome.Tab.PATROL)
        render()
    }
    override fun onResume() { super.onResume(); render() }
    override fun onDestroy() { scope.cancel(); super.onDestroy() }

    private fun api() = ApiClient(prefs.serverUrl, prefs.deviceToken)
    private fun session(): JSONObject? = store.config()?.optJSONObject("session")?.takeIf { System.currentTimeMillis() < PatrolStore.time(it.getString("expiresAt")) }

    private fun render() {
        val s = session()
        val f = SimpleDateFormat("HH:mm", Locale.getDefault())
        val fixes = mutableListOf<Pair<String, String>>(); val acts = mutableListOf<() -> Unit>()
        if (DeviceInfo.locationPermission(this) == "denied") { fixes += "Precise location is not allowed" to "Allow"; acts += { startActivity(Intent(this, PermissionsActivity::class.java)) } }
        if (!androidx.core.location.LocationManagerCompat.isLocationEnabled(getSystemService(LOCATION_SERVICE) as android.location.LocationManager)) { fixes += "Phone location is off" to "Turn on"; acts += { startActivity(Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS)) } }
        if (!androidx.core.app.NotificationManagerCompat.from(this).areNotificationsEnabled()) { fixes += "Check alerts are switched off" to "Turn on"; acts += { startActivity(Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, packageName)) } }
        fixActions = acts
        val recent = store.recentRows(5).map { r ->
            val at = PatrolStore.time(r.capturedAt)
            LogMapper.patrol(r.checkpointName, r.state, r.decision, r.localDecision, f.format(Date(at)), at, PatrolMessages.result(r.state, r.decision, r.localDecision))
        }
        val model = GuardScreens.Session(
            guard = s?.optString("guardName")?.takeIf { it.isNotBlank() }, site = s?.optString("siteName"),
            hours = s?.let { "${f.format(Date(PatrolStore.time(it.getString("startedAt"))))}–${f.format(Date(PatrolStore.time(it.getString("expiresAt"))))}" },
            recent = recent, fixes = fixes,
        )
        holder.removeAllViews()
        val content = Ui.column(this)
        content.addView(android.widget.Button(this).apply { text = "Gate Inventory"; isAllCaps = false; minHeight = Ui.dp(this@PatrolSessionActivity, 56); setOnClickListener { startActivity(Intent(this@PatrolSessionActivity, GateInventoryActivity::class.java)) } })
        content.addView(GuardScreens.session(this, model, message, actions))
        holder.addView(content)
        chrome.refreshSync()
    }

    private val actions = object : GuardScreens.SessionActions {
        override fun home() = GuardChrome.open(this@PatrolSessionActivity, GuardChrome.Tab.HOME)
        override fun settings() { startActivity(Intent(this@PatrolSessionActivity, SettingsActivity::class.java)) }
        override fun fix(index: Int) { fixActions.getOrNull(index)?.invoke() }
        override fun sync() = perform("Sending…") {
            GatewayService.requestSync(this@PatrolSessionActivity, Trigger.MANUAL)
            withContext(Dispatchers.IO) { zw.co.crisis.security.patrol.GateRuntime(this@PatrolSessionActivity).sync(api()); PatrolRuntime(this@PatrolSessionActivity).sync(api()) }
            "Sync completed. Check the status below for any records still waiting."
        }
        override fun endShift() {
            val s = session() ?: return
            AlertDialog.Builder(this@PatrolSessionActivity).setTitle("End your shift on this phone?")
                .setMessage("The next guard can then sign in. Scans already saved on this phone are still sent.")
                .setNegativeButton(android.R.string.cancel, null)
                .setPositiveButton("End shift") { _, _ ->
                    perform("Ending shift…") {
                        withContext(Dispatchers.IO) { api().patrolLogout(s.getString("id")) }
                        store.clearSession(); prefs.guardName = ""; prefs.lastFixAt = 0L
                        withContext(Dispatchers.IO) { SyncEngine(this@PatrolSessionActivity).refreshConfig() }
                        "Shift ended. The next guard can sign in on Home."
                    }
                }.show()
        }
    }

    private fun perform(working: String, action: suspend () -> String) {
        if (busy) return
        busy = true; message = working; render()
        scope.launch {
            message = try { action() }
            catch (e: ApiClient.ApiException) { if (e.status in 400..499) e.message ?: "Please try again." else "Cannot reach Crisis right now. Everything stays saved on this phone." }
            catch (e: java.io.IOException) { "Cannot reach Crisis right now. Everything stays saved on this phone." }
            catch (e: Exception) { e.message ?: "Unable to finish. Please try again." }
            busy = false; render()
        }
    }
}
