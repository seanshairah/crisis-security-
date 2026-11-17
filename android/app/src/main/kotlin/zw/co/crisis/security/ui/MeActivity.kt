package zw.co.crisis.security.ui

import android.os.Bundle
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import zw.co.crisis.security.GatewayApp
import zw.co.crisis.security.data.Prefs
import zw.co.crisis.security.patrol.PatrolStore
import java.util.Locale

/** Me: who is signed in on this company phone, this shift's figures, the phone's details, and light or dark. Works offline. */
class MeActivity : AppCompatActivity() {
    private lateinit var chrome: GuardChrome
    private lateinit var holder: FrameLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        holder = FrameLayout(this)
        chrome = GuardChrome.install(this, holder, GuardChrome.Tab.ME)
        render()
    }
    override fun onResume() { super.onResume(); render() }

    private fun render() {
        val prefs = Prefs(this)
        val s = PatrolStore.get(this).config()?.optJSONObject("session")?.takeIf { System.currentTimeMillis() < PatrolStore.time(it.getString("expiresAt")) }
        val name = s?.optString("guardName")?.takeIf { it.isNotBlank() } ?: prefs.guardName.ifBlank { "No guard signed in" }
        val hours = s?.let { (PatrolStore.time(it.getString("expiresAt")) - PatrolStore.time(it.getString("startedAt"))) / 3_600_000.0 }
        val verified = s?.optJSONArray("assignments")?.let { a -> (0 until a.length()).count { a.getJSONObject(it).optString("status") == "COMPLETED" } } ?: 0
        val time = android.text.format.DateFormat.getTimeFormat(this)
        val model = GuardScreens.Me(
            name = name, signedIn = s != null, site = s?.optString("siteName")?.takeIf { it.isNotBlank() } ?: prefs.dutySiteName.takeIf { it.isNotBlank() },
            shiftHours = hours?.let { String.format(Locale.getDefault(), "%.1f h", it) } ?: "—", verified = verified,
            details = listOf(
                "Duty site" to (s?.optString("siteName")?.takeIf { it.isNotBlank() } ?: prefs.dutySiteName.ifBlank { "—" }),
                "Shift ends" to (s?.let { time.format(java.util.Date(PatrolStore.time(it.getString("expiresAt")))) } ?: "—"),
                "Phone number" to prefs.phoneNumber.ifBlank { "—" },
                "Device" to prefs.deviceName.ifBlank { "—" },
            ),
            theme = prefs.themeMode,
        )
        holder.removeAllViews()
        holder.addView(GuardScreens.me(this, model) { mode ->
            if (mode != prefs.themeMode) { prefs.themeMode = mode; GatewayApp.applyTheme(mode) }
        })
        chrome.refreshSync()
    }
}
