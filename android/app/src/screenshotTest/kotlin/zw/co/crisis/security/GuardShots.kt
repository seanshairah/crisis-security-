package zw.co.crisis.security

import android.view.View
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.android.resources.NightMode
import org.junit.Rule
import org.junit.Test
import zw.co.crisis.security.patrol.ScanOutcome
import zw.co.crisis.security.ui.DeliveryTrail
import zw.co.crisis.security.ui.GuardChrome
import zw.co.crisis.security.ui.GuardScreens
import zw.co.crisis.security.ui.HomeEvent
import zw.co.crisis.security.ui.HomeLocation
import zw.co.crisis.security.ui.HomeModel
import zw.co.crisis.security.ui.HomeState
import zw.co.crisis.security.ui.HomeView
import zw.co.crisis.security.ui.HomeWindow
import zw.co.crisis.security.ui.LogMapper
import zw.co.crisis.security.ui.SyncLine

/**
 * The guard screens of handoff v3 drawn from sample data, in the same frame they ship in (glow, sync line, tab bar),
 * for comparing with the design files. Dark is the default on shift; light is checked too.
 */
abstract class GuardShots(night: Boolean) {
    @get:Rule val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_5.copy(nightMode = if (night) NightMode.NIGHT else NightMode.NOTNIGHT), theme = "Theme.Gateway")
    private val min = 60_000L
    private val ok = SyncLine.of(true, 0, 20_000)

    private fun shot(name: String, content: View, tab: GuardChrome.Tab?, glow: GuardChrome.Glow = GuardChrome.Glow.ACCENT, sync: SyncLine.View = ok) {
        val f = GuardChrome.frame(paparazzi.context, content, tab, glow) {}
        if (tab != null) GuardChrome.bindSync(paparazzi.context, f.sync, sync)
        paparazzi.snapshot(f.root, name)
    }

    private val gateB = HomeWindow("a1", "Gate B", 0, 20 * min, -17.8, 31.0, false)
    private fun home(state: HomeState) = HomeView.build(paparazzi.context, HomeModel("Harare Depot · On duty", "Evening, Tendai", state), object : HomeView.Actions {}).view
    private val events = listOf(
        HomeEvent(HomeEvent.Kind.VERIFIED, "Perimeter Fence verified", "22:04"),
        HomeEvent(HomeEvent.Kind.VERIFIED, "Warehouse 2 verified", "21:04"),
        HomeEvent(HomeEvent.Kind.ARRIVED, "Arrived on site", "17:56"),
    )

    fun homeOpen() = shot("home-check-open", home(HomeState.Open(gateB, 12 * min + 40_000, 20 * min, 40, true, HomeLocation.INSIDE, 4)), GuardChrome.Tab.HOME)
    fun homeClear() = shot("home-all-clear", home(HomeState.Clear(events)), GuardChrome.Tab.HOME, GuardChrome.Glow.OK)
    fun homeOffline() = shot("home-check-open-offline", home(HomeState.Open(gateB, 6 * min + 10_000, 20 * min, null, false, HomeLocation.UNKNOWN, 4)), GuardChrome.Tab.HOME, sync = SyncLine.of(false, 1, null))
    fun homeLocationOff() = shot("home-location-off", home(HomeState.LocationOff()), GuardChrome.Tab.HOME, sync = SyncLine.of(false, 3, null))
    fun homeSignIn() = shot("home-sign-in", HomeView.build(paparazzi.context, HomeModel("Harare Depot", "Evening", HomeState.SignIn), object : HomeView.Actions {}).view, GuardChrome.Tab.HOME)

    fun scanVerified() = shot("scan-verified", GuardScreens.scanResult(paparazzi.context, GuardScreens.ScanResult(ScanOutcome.VERIFIED, "Gate B", "22:14", null, 6, 50, 8), {}, {}, {}), null, GuardChrome.Glow.OK)
    fun scanSaved() = shot("scan-saved", GuardScreens.scanResult(paparazzi.context, GuardScreens.ScanResult(ScanOutcome.SAVED, "Gate B", "22:14", null, 12, 50, 18), {}, {}, {}), null)

    fun emergencySent() {
        val m = GuardScreens.Sent(true, "21:47", true, listOf(
            DeliveryTrail.StepState.DONE to ("Sent from this phone" to "21:47 · position attached"),
            DeliveryTrail.StepState.DONE to ("Received by operations" to "21:47"),
            DeliveryTrail.StepState.WAITING to ("Waiting for someone to acknowledge" to "You will see their name here."),
        ), true)
        val b = GuardScreens.emergencySent(paparazzi.context, m, {}, {}, {})
        b.setCountdown(4)
        shot("emergency-sent", b.view, null, GuardChrome.Glow.CRITICAL)
    }

    private val log = listOf(
        LogMapper.patrol("Perimeter Fence", "QUEUED", null, "LOCAL_MATCH", "21:45", 6, ""),
        LogMapper.alert("SHIFT_OK", "Shift going well", "ACKNOWLEDGED", "Acknowledged by Rumbi", "21:00", 5),
        LogMapper.patrol("Warehouse 2", "RECEIVED", "ACCEPTED", "LOCAL_MATCH", "21:04", 4),
        LogMapper.patrol("Gate A", "RECEIVED", "MISSED", null, "20:30", 3, "Missed · window closed 20:40"),
        LogMapper.patrol("Main Gate", "RECEIVED", "ACCEPTED", "LOCAL_MATCH", "20:02", 2),
    )
    fun shiftLog() = shot("shift-log", GuardScreens.log(paparazzi.context, log, null) {}, GuardChrome.Tab.LOG)
    fun alerts() = shot("alerts", GuardScreens.alerts(paparazzi.context, log.filter { it.kind == zw.co.crisis.security.ui.LogRow.Kind.ALERT }, true, object : GuardScreens.AlertActions {}), GuardChrome.Tab.ALERTS, GuardChrome.Glow.CRITICAL)
    fun patrolTab() = shot("patrol-tab", GuardScreens.session(paparazzi.context, GuardScreens.Session("Tendai Mapfumo", "Harare Depot", "18:00–06:00", log.filter { it.kind == zw.co.crisis.security.ui.LogRow.Kind.PATROL }, listOf("Check alerts are switched off" to "Turn on")), null, object : GuardScreens.SessionActions {}), GuardChrome.Tab.PATROL)
    fun me() = shot("me", GuardScreens.me(paparazzi.context, GuardScreens.Me("Tendai Mapfumo", true, "Harare Depot", "12.0 h", 4, listOf("Duty site" to "Harare Depot", "Shift ends" to "06:00", "Phone number" to "+263 77 884 2210", "Device" to "Gate phone"), "dark")) {}, GuardChrome.Tab.ME)
}

class GuardDark : GuardShots(night = true) {
    @Test fun homeOpenShot() = homeOpen()
    @Test fun homeClearShot() = homeClear()
    @Test fun homeOfflineShot() = homeOffline()
    @Test fun homeLocationOffShot() = homeLocationOff()
    @Test fun homeSignInShot() = homeSignIn()
    @Test fun scanVerifiedShot() = scanVerified()
    @Test fun scanSavedShot() = scanSaved()
    @Test fun emergencySentShot() = emergencySent()
    @Test fun shiftLogShot() = shiftLog()
    @Test fun alertsShot() = alerts()
    @Test fun patrolTabShot() = patrolTab()
    @Test fun meShot() = me()
}

class GuardLight : GuardShots(night = false) {
    @Test fun homeOpenShot() = homeOpen()
    @Test fun homeClearShot() = homeClear()
    @Test fun alertsShot() = alerts()
}
