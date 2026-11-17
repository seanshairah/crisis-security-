package zw.co.crisis.security.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import zw.co.crisis.security.data.Prefs
import zw.co.crisis.security.location.AcquisitionPolicy
import zw.co.crisis.security.location.LocationMonitor
import zw.co.crisis.security.model.GatewayEvent
import zw.co.crisis.security.net.ApiClient
import zw.co.crisis.security.patrol.CheckpointCode
import zw.co.crisis.security.patrol.CoordinateCheckpoint
import zw.co.crisis.security.patrol.PatrolMessages
import zw.co.crisis.security.patrol.PatrolRuntime
import zw.co.crisis.security.patrol.PatrolStore
import zw.co.crisis.security.patrol.PatrolWindows
import zw.co.crisis.security.patrol.ScanOutcome
import zw.co.crisis.security.service.GatewayService
import zw.co.crisis.security.util.DeviceInfo
import java.util.UUID

/**
 * Guard Home (handoff v3). One job: show whether a check is open. The scan control sits in the middle with its
 * countdown around it; when nothing is open the screen is calm. Sign-in, location-off and offline are states of
 * the same screen. Session tools (sync, hand over, recent scans) live in the Patrol tab.
 */
class PatrolActivity : AppCompatActivity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var store: PatrolStore
    private lateinit var prefs: Prefs
    private lateinit var chrome: GuardChrome
    private lateinit var holder: FrameLayout
    private var bound: HomeView.Bound? = null
    private var openWindow: HomeWindow? = null
    private var selected: JSONObject? = null
    private var selectedSession: JSONObject? = null
    private var busy = false
    private var message: String? = null
    private var messageIsError = false
    private val handler = Handler(Looper.getMainLooper())

    /** Every second while a check is open (the countdown), every ten seconds otherwise. */
    private val ticker = object : Runnable {
        override fun run() {
            val w = openWindow
            if (w != null) {
                val left = w.expiresAt - System.currentTimeMillis()
                if (left <= 0) render() else bound?.tick?.invoke(left)
            }
            handler.postDelayed(this, if (openWindow != null) 1000 else 10_000)
        }
    }
    private val slow = object : Runnable { override fun run() { if (!busy) render(); chrome.refreshSync(); handler.postDelayed(this, 10_000) } }

    private val scanner = registerForActivityResult(ScanContract()) { result ->
        val qr = result.contents
        val a = selected; val s = selectedSession
        if (qr != null && a != null && s != null) capture(s, a, qr)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this); store = PatrolStore.get(this)
        holder = FrameLayout(this)
        chrome = GuardChrome.install(this, holder, GuardChrome.Tab.HOME)
        render()
        // A quiet sync on open: the plan and scan results refresh without a "Working…" banner.
        scope.launch { runCatching { withContext(Dispatchers.IO) { PatrolRuntime(this@PatrolActivity).sync(api()) } }; if (!busy) render() }
    }
    override fun onResume() { super.onResume(); GatewayService.start(this); render(); handler.post(ticker); handler.postDelayed(slow, 10_000) }
    override fun onPause() { handler.removeCallbacks(ticker); handler.removeCallbacks(slow); super.onPause() }
    override fun onDestroy() { scope.cancel(); super.onDestroy() }

    private fun api() = ApiClient(prefs.serverUrl, prefs.deviceToken)
    private fun localTime(value: String): String = android.text.format.DateFormat.getTimeFormat(this).format(java.util.Date(PatrolStore.time(value)))
    private fun session(): JSONObject? = store.config()?.optJSONObject("session")?.takeIf { System.currentTimeMillis() < PatrolStore.time(it.getString("expiresAt")) }
    private fun assignment(id: String): JSONObject? = session()?.optJSONArray("assignments")?.let { a -> (0 until a.length()).map { a.getJSONObject(it) }.firstOrNull { it.getString("id") == id } }

    private fun locationUsable(): Boolean =
        DeviceInfo.locationPermission(this) != "denied" &&
            androidx.core.location.LocationManagerCompat.isLocationEnabled(getSystemService(LOCATION_SERVICE) as android.location.LocationManager)

    private fun model(): HomeModel {
        val s = session()
        val now = System.currentTimeMillis()
        val windows = s?.optJSONArray("assignments")?.let { arr ->
            (0 until arr.length()).map { arr.getJSONObject(it) }.map { a ->
                HomeWindow(a.getString("id"), a.getString("checkpointName"), PatrolStore.time(a.getString("dueAt")), PatrolStore.time(a.getString("expiresAt")),
                    a.optDouble("latitude").takeIf { !it.isNaN() }, a.optDouble("longitude").takeIf { !it.isNaN() },
                    a.optString("status") == "COMPLETED" || store.hasScan(a.getString("id")))
            }
        } ?: emptyList()
        val fresh = prefs.lastFixAt > 0 && now - prefs.lastFixAt < 10 * 60_000
        val events = store.recentRows(10).map { r ->
            val local = r.state == "QUEUED" && (r.localDecision == null || r.localDecision == "LOCAL_MATCH")
            val kind = when { r.decision == "ACCEPTED" -> HomeEvent.Kind.VERIFIED; local -> HomeEvent.Kind.SAVED; else -> HomeEvent.Kind.PROBLEM }
            val word = when (kind) { HomeEvent.Kind.VERIFIED -> "verified"; HomeEvent.Kind.SAVED -> "saved offline"; else -> "needs attention" }
            HomeEvent(kind, "${r.checkpointName} $word", localTime(r.capturedAt))
        }
        val state = HomeLogic.resolve(
            hasSession = s != null, locationUsable = locationUsable(), windows = windows, now = now,
            sessionEnd = s?.let { PatrolStore.time(it.getString("expiresAt")) } ?: 0L, online = DeviceInfo.isOnline(this),
            location = when (prefs.lastFixState) { "INSIDE" -> HomeLocation.INSIDE; "OUTSIDE" -> HomeLocation.OUTSIDE; else -> HomeLocation.UNKNOWN },
            checksDone = windows.count { it.done },
            distanceTo = { w -> if (fresh && w.latitude != null && w.longitude != null) FloatArray(1).also { android.location.Location.distanceBetween(prefs.lastFixLat, prefs.lastFixLng, w.latitude, w.longitude, it) }[0].toInt() else null },
            events = events,
        )
        val name = s?.optString("guardName")?.takeIf { it.isNotBlank() } ?: prefs.guardName
        val site = s?.optString("siteName")?.takeIf { it.isNotBlank() } ?: prefs.dutySiteName.ifBlank { "Crisis Security" }
        return HomeModel(
            siteLine = if (s != null) "$site · On duty" else site,
            greeting = HomeLogic.greeting(java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY), name),
            state = state, message = message, messageIsError = messageIsError,
        )
    }

    private fun render() {
        val m = model()
        openWindow = (m.state as? HomeState.Open)?.window
        val b = HomeView.build(this, m, actions)
        bound = b
        holder.removeAllViews(); holder.addView(b.view)
        chrome.refreshSync()
    }

    private fun say(text: String?, error: Boolean = false) { message = text; messageIsError = error; render() }

    private val actions = object : HomeView.Actions {
        override fun bell() = GuardChrome.open(this@PatrolActivity, GuardChrome.Tab.ALERTS)
        override fun openLocationSettings() {
            if (DeviceInfo.locationPermission(this@PatrolActivity) == "denied") startActivity(Intent(this@PatrolActivity, PermissionsActivity::class.java))
            else startActivity(Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS))
        }
        override fun signIn(guardNo: String, pin: String) {
            runAction {
                val cfg = withContext(Dispatchers.IO) { api().patrolLogin(guardNo, pin) }
                store.saveConfig(cfg); prefs.guardName = cfg.optJSONObject("session")?.optString("guardName") ?: ""; prefs.lastFixAt = 0L
                withContext(Dispatchers.IO) { zw.co.crisis.security.service.SyncEngine(this@PatrolActivity).refreshConfig() }
                null
            }
        }
        override fun scan(window: HomeWindow) {
            if (busy) return
            if (ContextCompat.checkSelfPermission(this@PatrolActivity, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this@PatrolActivity, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), 71)
                say("Allow precise location, then tap Scan now again."); return
            }
            val s = session() ?: return
            val a = assignment(window.assignmentId) ?: return
            selected = a; selectedSession = s
            scanner.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setPrompt("Scan ${a.getString("checkpointName")}").setBeepEnabled(true)
                .setCaptureActivity(PatrolCaptureActivity::class.java).setOrientationLocked(false)
                .setTimeout((PatrolStore.time(a.getString("expiresAt")) - System.currentTimeMillis()).coerceAtLeast(1000L)))
        }
    }

    /** Runs [action]; its returned text (or a plain error) is shown under the header. */
    private fun runAction(action: suspend () -> String?) {
        if (busy) return
        busy = true; say("Working…")
        scope.launch {
            var error = false
            val text = try { action() }
            catch (e: ApiClient.ApiException) { error = true; if (e.status in 400..499) e.message ?: "Please check your details and try again." else "Cannot reach Crisis right now. Your patrol plan and saved scans are kept on this phone." }
            catch (e: java.io.IOException) { "Cannot reach Crisis right now. Your patrol plan and saved scans are kept on this phone." }
            catch (e: Exception) { error = true; e.message ?: "Unable to finish. Please try again." }
            busy = false; say(text, error)
        }
    }

    private fun capture(s: JSONObject, a: JSONObject, qr: String) {
        val hash = CheckpointCode.sha256(qr)
        if (hash != a.getString("qrHash")) { say("Wrong checkpoint QR. Scan ${a.getString("checkpointName")}.", true); return }
        val checkpoint = CheckpointCode.verified(qr, a.getString("qrHash"), CoordinateCheckpoint(a.getString("checkpointId"), s.getString("siteId"), a.optDouble("latitude"), a.optDouble("longitude"), a.optInt("radiusM")))
        if (checkpoint == null) { say("This sign needs updating. Ask your supervisor for a coordinate QR sign, then sync this phone.", true); return }
        runAction {
            val now = System.currentTimeMillis()
            if (!PatrolWindows.isOpen(now, PatrolStore.time(a.getString("dueAt")), PatrolStore.time(a.getString("expiresAt")), PatrolStore.time(s.getString("expiresAt")))) throw IllegalStateException("This check has closed.")
            say("QR read. Getting a fresh location — this can take up to a minute…")
            val monitor = LocationMonitor(this@PatrolActivity)
            val fix = withContext(Dispatchers.IO) { monitor.acquireForRequest(AcquisitionPolicy(acceptableM = 30f)) }
            val event = JSONObject().put("eventId", UUID.randomUUID().toString()).put("sessionId", s.getString("id")).put("assignmentId", a.getString("id")).put("qr", qr).put("capturedAt", GatewayEvent.iso(now)).put("gpsCapturedAt", fix?.let { GatewayEvent.iso(it.time) } ?: JSONObject.NULL)
                .put("latitude", fix?.latitude ?: JSONObject.NULL).put("longitude", fix?.longitude ?: JSONObject.NULL).put("accuracyM", fix?.accuracy?.toDouble() ?: JSONObject.NULL).put("mock", fix?.let { monitor.isMockFix(it) } ?: false)
            val localDecision = if (fix != null && !CheckpointCode.gpsTimeValid(now, fix.time, System.currentTimeMillis())) "GPS_TIME_UNCERTAIN" else CheckpointCode.locationDecision(checkpoint, fix?.latitude, fix?.longitude, fix?.accuracy, fix?.let { monitor.isMockFix(it) } ?: false)
            withContext(Dispatchers.IO) { store.enqueue(event, a.getString("checkpointName"), localDecision) }
            if (localDecision == "LOCAL_MATCH") holder.performHapticFeedback(android.view.HapticFeedbackConstants.CONFIRM)
            // Upload is independent of capture. Failed transport never rolls back a queued scan.
            withContext(Dispatchers.IO) { runCatching { PatrolRuntime(this@PatrolActivity).sync(api()) } }
            val receipt = store.recentRows().firstOrNull { it.eventId == event.getString("eventId") }
            val distanceM = if (fix != null) FloatArray(1).also { android.location.Location.distanceBetween(fix.latitude, fix.longitude, a.optDouble("latitude"), a.optDouble("longitude"), it) }[0].toInt() else -1
            val outcome = ScanOutcome.of(receipt?.decision, localDecision)
            startActivity(Intent(this@PatrolActivity, ScanResultActivity::class.java)
                .putExtra(ScanResultActivity.EXTRA_OUTCOME, outcome.name)
                .putExtra(ScanResultActivity.EXTRA_CHECKPOINT, a.getString("checkpointName"))
                .putExtra(ScanResultActivity.EXTRA_TIME, localTime(GatewayEvent.iso(now)))
                .putExtra(ScanResultActivity.EXTRA_MESSAGE, if (outcome == ScanOutcome.VERIFIED) null else PatrolMessages.result(receipt?.state ?: "RECEIVED", receipt?.decision, localDecision))
                .putExtra(ScanResultActivity.EXTRA_DISTANCE_M, distanceM)
                .putExtra(ScanResultActivity.EXTRA_RADIUS_M, a.optInt("radiusM", -1))
                .putExtra(ScanResultActivity.EXTRA_ACCURACY_M, fix?.accuracy?.toInt() ?: -1))
            null
        }
    }
}
