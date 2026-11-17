package zw.co.crisis.security.ui

import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import zw.co.crisis.security.R
import zw.co.crisis.security.patrol.ScanOutcome
import zw.co.crisis.security.ui.Ui.MATCH
import zw.co.crisis.security.ui.Ui.WRAP

/**
 * The guard screens of handoff v2/v3 other than Home, drawn from plain models so the snapshot tests render them with
 * sample data. Activities load the data and pass the callbacks; nothing here reads storage or the network.
 */
object GuardScreens {
    private fun pad(c: Context) = Ui.column(c).apply { setPadding(Ui.dp(c, 22), Ui.dp(c, 16), Ui.dp(c, 22), Ui.dp(c, 28)) }

    fun backRow(c: Context, title: String, onBack: () -> Unit) = Ui.row(c, 10).apply {
        addView(FrameLayout(c).apply {
            background = Ui.oval(c.getColor(R.color.chip)); isClickable = true; isFocusable = true; contentDescription = "Back"
            addView(Ui.icon(c, R.drawable.ms_arrow_back, 22, R.color.ink).also { Ui.center(it) }); setOnClickListener { onBack() }
        }, LinearLayout.LayoutParams(Ui.dp(c, 48), Ui.dp(c, 48)))
        addView(Ui.text(c, title, 16f, R.color.ink, 500))
    }

    private fun screenTitle(c: Context, col: LinearLayout, title: String, sub: String?) {
        col.addView(Ui.title(c, title, 32f))
        if (sub != null) col.addView(Ui.text(c, sub, 13f, R.color.ink2), Ui.lp(MATCH, WRAP, Ui.dp(c, 6)))
    }

    private fun card(c: Context, fill: Int = R.color.surface, line: Int = R.color.line, radius: Int = 24) = Ui.column(c).apply {
        background = Ui.round(c, c.getColor(fill), radius, c.getColor(line)); setPadding(Ui.dp(c, 16), Ui.dp(c, 16), Ui.dp(c, 16), Ui.dp(c, 16))
    }

    private fun tone(t: LogRow.Tone) = when (t) { LogRow.Tone.OK -> R.color.ok; LogRow.Tone.WARN -> R.color.warn; LogRow.Tone.CRITICAL -> R.color.critical; LogRow.Tone.NEUTRAL -> R.color.ink2 }

    // ── Scan result (2b) ──────────────────────────────────────────────────────────────────────
    data class ScanResult(val outcome: ScanOutcome, val checkpoint: String, val time: String, val message: String?, val distanceM: Int, val radiusM: Int, val accuracyM: Int)

    fun scanResult(c: Context, m: ScanResult, onBack: () -> Unit, onHome: () -> Unit, onLog: () -> Unit): View {
        val dp = { v: Number -> Ui.dp(c, v) }
        val col = pad(c)
        col.addView(backRow(c, "Checkpoint scan", onBack))
        val (from, to, icon, iconTint, title) = when (m.outcome) {
            ScanOutcome.VERIFIED -> Look(0xFF7FD17A.toInt(), 0xFF2F7A37.toInt(), R.drawable.ms_check, 0xFF0D1F0D.toInt(), "Verified checkpoint")
            ScanOutcome.SAVED -> Look(0xFFF0B24A.toInt(), 0xFFA8720F.toInt(), R.drawable.ms_cloud_off, 0xFF1A1008.toInt(), "Saved offline")
            ScanOutcome.PROBLEM -> Look(0xFFE5452F.toInt(), 0xFF9C1F12.toInt(), R.drawable.ms_error, 0xFFFFFFFF.toInt(), "Scan needs attention")
        }
        val halo = FrameLayout(c)
        listOf(176 to 0x11, 144 to 0x22).forEach { (size, alpha) -> halo.addView(View(c).apply { background = Ui.oval((from and 0x00FFFFFF) or (alpha shl 24)) }, FrameLayout.LayoutParams(dp(size), dp(size), Gravity.CENTER)) }
        halo.addView(FrameLayout(c).apply {
            background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(from, to)).apply { shape = GradientDrawable.OVAL }
            addView(Ui.icon(c, icon, 62, R.color.ink).apply { imageTintList = android.content.res.ColorStateList.valueOf(iconTint) }.also { Ui.center(it) })
        }, FrameLayout.LayoutParams(dp(116), dp(116), Gravity.CENTER))
        col.addView(halo, Ui.lp(MATCH, dp(176), dp(10)))
        col.addView(Ui.title(c, title, 38f).apply { gravity = Gravity.CENTER }, Ui.lp(MATCH, WRAP, dp(14)))
        col.addView(Ui.text(c, "${m.checkpoint} · ${m.time}", 15f, R.color.ink2).apply { gravity = Gravity.CENTER }, Ui.lp(MATCH, WRAP, dp(8)))

        val inside = m.distanceM >= 0 && (m.radiusM < 0 || m.distanceM <= m.radiusM)
        val stats = Ui.row(c, 10, Gravity.TOP)
        stats.addView(stat(c, "Distance", if (m.distanceM < 0) "No fix" else "${m.distanceM} m", when { m.distanceM < 0 -> "GPS not available"; inside -> "Inside fence"; else -> "Outside fence" }, if (inside) R.color.ok else R.color.critical), LinearLayout.LayoutParams(0, WRAP, 1f))
        stats.addView(stat(c, "GPS accuracy", if (m.accuracyM < 0) "—" else "± ${m.accuracyM} m", "Limit 50 m", if (m.accuracyM in 0..50) R.color.ok else R.color.warn), LinearLayout.LayoutParams(0, WRAP, 1f))
        col.addView(stats, Ui.lp(MATCH, WRAP, dp(24)))

        val (noteFill, noteLine, noteIcon, noteTint, head, body) = when (m.outcome) {
            ScanOutcome.VERIFIED -> Note(R.color.ok_soft, R.color.ok_line, R.drawable.ms_cloud_done, R.color.ok, "Operations has it.", "No signal next time? It will say Saved offline and send itself.")
            ScanOutcome.SAVED -> Note(R.color.warn_soft, R.color.warn_line, R.drawable.ms_cloud_off, R.color.warn, "Saved on this phone.", "It sends itself when there is signal. Nothing more to do.")
            ScanOutcome.PROBLEM -> Note(R.color.critical_soft, R.color.critical, R.drawable.ms_error, R.color.critical, "This scan did not count.", m.message ?: "Scan again inside the fence, or call operations.")
        }
        col.addView(Ui.row(c, 12).apply {
            background = Ui.round(c, c.getColor(noteFill), 24, c.getColor(noteLine)); setPadding(dp(16), dp(16), dp(16), dp(16))
            addView(Ui.icon(c, noteIcon, 24, noteTint))
            addView(Ui.column(c).apply { addView(Ui.text(c, head, 14f, R.color.ink, 700)); addView(Ui.text(c, body, 14f, if (m.outcome == ScanOutcome.VERIFIED) R.color.ok_text else R.color.ink2).apply { setPadding(0, dp(2), 0, 0) }) }, LinearLayout.LayoutParams(0, WRAP, 1f))
        }, Ui.lp(MATCH, WRAP, dp(12)))
        col.addView(View(c), LinearLayout.LayoutParams(MATCH, 0, 1f))
        col.addView(HomeView.primaryButton(c, null, "Back to home", onHome), Ui.lp(MATCH, dp(60), dp(24)))
        col.addView(HomeView.secondaryButton(c, null, "View shift log", onLog), Ui.lp(MATCH, dp(56), dp(10)))
        return col
    }
    private data class Look(val from: Int, val to: Int, val icon: Int, val iconTint: Int, val title: String)
    private data class Note(val fill: Int, val line: Int, val icon: Int, val tint: Int, val head: String, val body: String)

    private fun stat(c: Context, label: String, value: String, sub: String, subTint: Int) = card(c, R.color.card2, R.color.card2_line).apply {
        addView(Ui.text(c, label, 13f, R.color.ink2))
        addView(Ui.text(c, value, 24f, R.color.ink, 600), Ui.lp(MATCH, WRAP, Ui.dp(c, 8)))
        addView(Ui.text(c, sub, 13f, subTint), Ui.lp(MATCH, WRAP, Ui.dp(c, 2)))
    }

    // ── Emergency sent (2d) ───────────────────────────────────────────────────────────────────
    data class Sent(val delivered: Boolean, val time: String, val withPosition: Boolean, val steps: List<Pair<DeliveryTrail.StepState, Pair<String, String>>>, val canCall: Boolean)

    class SentBound(val view: View, val setCountdown: (Int?) -> Unit, val setMistakeDone: () -> Unit)

    fun emergencySent(c: Context, m: Sent, onMistake: () -> Unit, onCall: () -> Unit, onBack: () -> Unit): SentBound {
        val dp = { v: Number -> Ui.dp(c, v) }
        val col = pad(c)
        col.addView(backRow(c, "Emergency", onBack))
        val head = Ui.column(c).apply {
            background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(0xFFE5452F.toInt(), 0xFF9C1F12.toInt())).apply { cornerRadius = dp(32).toFloat() }
            setPadding(dp(22), dp(22), dp(22), dp(22))
        }
        head.addView(Ui.row(c, 12).apply {
            addView(Ui.icon(c, R.drawable.ms_emergency, 40, R.color.white))
            addView(Ui.column(c).apply {
                addView(Ui.text(c, if (m.delivered) "Emergency sent" else "Emergency saved", 24f, R.color.white, 700))
                addView(Ui.text(c, "${m.time} · ${if (m.withPosition) "with your position" else "without a position yet"}", 13f, R.color.white).apply { alpha = 0.88f })
            })
        })
        val mistake = Ui.row(c, 10, Gravity.CENTER).apply {
            background = Ui.round(c, 0x2EFFFFFF, 26); isClickable = true; isFocusable = true
            addView(Ui.icon(c, R.drawable.ms_undo, 22, R.color.white))
            setOnClickListener { onMistake() }
        }
        val mistakeLabel = Ui.text(c, "", 16f, R.color.white, 600)
        mistake.addView(mistakeLabel)
        head.addView(mistake, Ui.lp(MATCH, dp(52), dp(16)))
        val done = Ui.text(c, "Operations has been told it was a mistake. They will still check on you.", 13.5f, R.color.white).apply { visibility = View.GONE }
        head.addView(done, Ui.lp(MATCH, WRAP, dp(12)))
        col.addView(head, Ui.lp(MATCH, WRAP, dp(16)))

        val trail = Ui.column(c)
        m.steps.forEach { (state, text) ->
            val (bg, icon, tint) = when (state) {
                DeliveryTrail.StepState.DONE -> Triple(R.color.ok_soft, R.drawable.ms_check, R.color.ok)
                DeliveryTrail.StepState.WAITING -> Triple(R.color.warn_soft, R.drawable.ms_schedule, R.color.warn)
                DeliveryTrail.StepState.FAILED -> Triple(R.color.critical_soft, R.drawable.ms_error, R.color.critical)
            }
            trail.addView(Ui.row(c, 14, Gravity.TOP).apply {
                setPadding(0, 0, 0, dp(18))
                addView(FrameLayout(c).apply { background = Ui.oval(c.getColor(bg)); addView(Ui.icon(c, icon, 20, tint).also { Ui.center(it) }) }, LinearLayout.LayoutParams(dp(34), dp(34)))
                addView(Ui.column(c).apply { addView(Ui.text(c, text.first, 15f, R.color.ink, 600)); addView(Ui.text(c, text.second, 13f, R.color.ink2).apply { setPadding(0, dp(2), 0, 0) }) })
            })
        }
        col.addView(trail, Ui.lp(MATCH, WRAP, dp(18)))
        col.addView(View(c), LinearLayout.LayoutParams(MATCH, 0, 1f))
        if (m.canCall) col.addView(Ui.row(c, 10, Gravity.CENTER).apply {
            background = Ui.round(c, c.getColor(R.color.strong_surface), 30); isClickable = true; isFocusable = true; contentDescription = "Call operations"
            addView(Ui.icon(c, R.drawable.ms_call, 24, R.color.on_strong)); addView(Ui.text(c, "Call operations", 17f, R.color.on_strong, 700))
            setOnClickListener { onCall() }
        }, Ui.lp(MATCH, dp(60), dp(20)))
        col.addView(Ui.text(c, "Not delivered? It stays saved on this phone and keeps retrying.", 12.5f, R.color.ok_text).apply { gravity = Gravity.CENTER }, Ui.lp(MATCH, WRAP, dp(10)))
        return SentBound(col, { left ->
            if (left == null || left <= 0) mistake.visibility = View.GONE
            else { mistake.visibility = View.VISIBLE; mistakeLabel.text = "Sent by mistake? Tell operations · ${left}s"; mistake.contentDescription = mistakeLabel.text }
        }, { mistake.visibility = View.GONE; done.visibility = View.VISIBLE })
    }

    // ── Shift log (2e) ────────────────────────────────────────────────────────────────────────
    fun log(c: Context, rows: List<LogRow>, filter: LogRow.Kind?, onFilter: (LogRow.Kind?) -> Unit): View {
        val dp = { v: Number -> Ui.dp(c, v) }
        val col = pad(c)
        screenTitle(c, col, "Shift log", "Everything you did tonight, as operations sees it.")
        val chips = Ui.row(c, 8)
        listOf<Pair<String, LogRow.Kind?>>("All" to null, "Patrols" to LogRow.Kind.PATROL, "Alerts" to LogRow.Kind.ALERT).forEach { (label, kind) ->
            val on = kind == filter
            chips.addView(Ui.text(c, label, 13f, if (on) R.color.on_strong else R.color.ink, if (on) 600 else 500).apply {
                background = Ui.round(c, c.getColor(if (on) R.color.strong_surface else R.color.chip), 20); setPadding(dp(16), dp(10), dp(16), dp(10))
                isClickable = true; isFocusable = true; isSelected = on; setOnClickListener { onFilter(kind) }
            })
        }
        col.addView(chips, Ui.lp(MATCH, WRAP, dp(14)))
        val list = LogMapper.filter(rows, filter)
        if (list.isEmpty()) col.addView(Ui.text(c, "Nothing yet this shift.", 14f, R.color.ink2), Ui.lp(MATCH, WRAP, dp(20)))
        list.forEach { r ->
            col.addView(Ui.row(c, 12).apply {
                setPadding(0, dp(11), 0, dp(11))
                addView(FrameLayout(c).apply { background = Ui.round(c, c.getColor(R.color.surface3), 12); addView(Ui.icon(c, r.icon, 20, tone(r.tone)).also { Ui.center(it) }) }, LinearLayout.LayoutParams(dp(38), dp(38)))
                addView(Ui.column(c).apply { addView(Ui.text(c, r.title, 14f, R.color.ink, 500)); addView(Ui.text(c, r.status, 12f, tone(r.tone)).apply { setPadding(0, dp(1), 0, 0) }) }, LinearLayout.LayoutParams(0, WRAP, 1f))
                addView(Ui.text(c, r.time, 12f, R.color.ink2))
                contentDescription = "${r.title}, ${r.status}, ${r.time}"
            }, Ui.lp(MATCH, WRAP))
            col.addView(View(c).apply { setBackgroundColor(c.getColor(R.color.line)) }, LinearLayout.LayoutParams(MATCH, dp(1)))
        }
        return col
    }

    // ── Alerts (2c) ───────────────────────────────────────────────────────────────────────────
    interface AlertActions {
        fun emergency() {}
        fun emergencyAccessible() {}
        fun assistance() {}
        fun ok() {}
        fun incident() {}
        fun late() {}
        fun security() {}
        fun status() {}
        fun handover() {}
        fun callOps() {}
    }

    fun alerts(c: Context, history: List<LogRow>, canCall: Boolean, a: AlertActions): View {
        val dp = { v: Number -> Ui.dp(c, v) }
        val col = pad(c)
        screenTitle(c, col, "Alerts", "Operations sees these with your position.")
        val ring = HoldRingView(c).apply {
            label = "Hold 2 s"; contentDescription = "Emergency. Hold for two seconds to send."
            onComplete = { a.emergency() }
            setOnClickListener { a.emergencyAccessible() }
        }
        col.addView(FrameLayout(c).apply { addView(ring, FrameLayout.LayoutParams(dp(210), dp(210), Gravity.CENTER)) }, Ui.lp(MATCH, dp(210), dp(22)))
        val caption = Ui.text(c, "Hold 2 seconds to send an emergency", 14f, R.color.ink2).apply { gravity = Gravity.CENTER; accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
        ring.onProgress = { p -> caption.text = if (p <= 0f) "Hold 2 seconds to send an emergency" else "Release to cancel · sends in ${HoldMath.remainingMs(p).let { (it + 999) / 1000 }} second${if (HoldMath.remainingMs(p) > 1000) "s" else ""}"; ring.label = if (p <= 0f) "Hold 2 s" else "Keep holding" }
        col.addView(caption, Ui.lp(MATCH, WRAP, dp(14)))

        fun tile(icon: Int, tint: Int, label: String, act: () -> Unit) = Ui.column(c).apply {
            background = Ui.round(c, c.getColor(R.color.card2), 22, c.getColor(R.color.card2_line)); setPadding(dp(14), dp(14), dp(14), dp(14))
            minimumHeight = dp(76); isClickable = true; isFocusable = true; contentDescription = label
            addView(Ui.icon(c, icon, 24, tint)); addView(View(c), LinearLayout.LayoutParams(1, 0, 1f))
            addView(Ui.text(c, label, 14f, R.color.ink, 600), Ui.lp(MATCH, WRAP, dp(10)))
            setOnClickListener { act() }
        }
        fun pair(l: View, r: View) = Ui.row(c, 10, Gravity.TOP).apply { addView(l, LinearLayout.LayoutParams(0, WRAP, 1f)); addView(r, LinearLayout.LayoutParams(0, WRAP, 1f)) }
        col.addView(pair(tile(R.drawable.ms_support_agent, R.color.accent_bright, "Need assistance") { a.assistance() }, tile(R.drawable.ms_thumb_up, R.color.ok, "Shift going well") { a.ok() }), Ui.lp(MATCH, WRAP, dp(22)))
        col.addView(pair(tile(R.drawable.ms_report, R.color.critical, "Report incident") { a.incident() }, tile(R.drawable.ms_schedule, R.color.warn, "Running late") { a.late() }), Ui.lp(MATCH, WRAP, dp(10)))

        val more = card(c, R.color.surface, R.color.line, 22).apply { setPadding(dp(16), dp(4), dp(16), dp(4)) }
        listOf(Triple(R.drawable.ms_shield, "Security alert") { a.security() }, Triple(R.drawable.ms_chat, "Status update") { a.status() }, Triple(R.drawable.ms_swap_horiz, "Shift handover") { a.handover() })
            .plus(if (canCall) listOf(Triple(R.drawable.ms_call, "Call operations") { a.callOps() }) else emptyList())
            .forEachIndexed { i, (icon, label, act) ->
                if (i > 0) more.addView(View(c).apply { setBackgroundColor(c.getColor(R.color.line)) }, LinearLayout.LayoutParams(MATCH, dp(1)))
                more.addView(Ui.row(c, 12).apply {
                    minimumHeight = dp(52); isClickable = true; isFocusable = true; contentDescription = label; setOnClickListener { act() }
                    addView(Ui.icon(c, icon, 22, R.color.ink2)); addView(Ui.text(c, label, 15f, R.color.ink, 500), LinearLayout.LayoutParams(0, WRAP, 1f)); addView(Ui.icon(c, R.drawable.ms_chevron_right, 20, R.color.ink3))
                })
            }
        col.addView(Ui.text(c, "More messages", 13f, R.color.ink2), Ui.lp(MATCH, WRAP, dp(22)))
        col.addView(more, Ui.lp(MATCH, WRAP, dp(8)))

        col.addView(Ui.text(c, "Sent to operations", 13f, R.color.ink2), Ui.lp(MATCH, WRAP, dp(22)))
        if (history.isEmpty()) col.addView(Ui.text(c, "Nothing sent this shift.", 14f, R.color.ink3), Ui.lp(MATCH, WRAP, dp(8)))
        history.take(5).forEach { r ->
            col.addView(Ui.row(c, 12).apply {
                setPadding(0, dp(10), 0, dp(10))
                addView(Ui.icon(c, r.icon, 20, tone(r.tone)))
                addView(Ui.column(c).apply { addView(Ui.text(c, r.title, 14f, R.color.ink, 500)); addView(Ui.text(c, r.status, 12f, tone(r.tone))) }, LinearLayout.LayoutParams(0, WRAP, 1f))
                addView(Ui.text(c, r.time, 12f, R.color.ink2))
            })
        }
        col.addView(Ui.text(c, c.getString(R.string.alert_privacy), 12f, R.color.ink3), Ui.lp(MATCH, WRAP, dp(16)))
        return col
    }

    // ── Patrol tab: this shift on this phone ──────────────────────────────────────────────────
    data class Session(val guard: String?, val site: String?, val hours: String?, val recent: List<LogRow>, val fixes: List<Pair<String, String>>)
    interface SessionActions { fun sync() {}; fun endShift() {}; fun fix(index: Int) {}; fun settings() {}; fun home() {} }

    fun session(c: Context, m: Session, message: String?, a: SessionActions): View {
        val dp = { v: Number -> Ui.dp(c, v) }
        val col = pad(c)
        screenTitle(c, col, "Patrol", "This shift on this phone.")
        message?.let { col.addView(Ui.text(c, it, 14f, R.color.ink2, 500).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }, Ui.lp(MATCH, WRAP, dp(12))) }
        if (m.guard == null) {
            col.addView(card(c).apply {
                addView(Ui.text(c, "No one is signed in", 17f, R.color.ink, 600))
                addView(Ui.text(c, "Sign in on Home with your guard number and PIN.", 14f, R.color.ink2), Ui.lp(MATCH, WRAP, dp(6)))
            }, Ui.lp(MATCH, WRAP, dp(18)))
            col.addView(HomeView.primaryButton(c, R.drawable.ms_home, "Go to Home") { a.home() }, Ui.lp(MATCH, dp(56), dp(14)))
        } else {
            col.addView(card(c).apply {
                addView(Ui.text(c, m.guard, 19f, R.color.ink, 600))
                addView(Ui.text(c, listOfNotNull(m.site, m.hours).joinToString(" · "), 14f, R.color.ink2), Ui.lp(MATCH, WRAP, dp(4)))
            }, Ui.lp(MATCH, WRAP, dp(18)))
            col.addView(HomeView.secondaryButton(c, R.drawable.ms_sync, "Send everything now") { a.sync() }, Ui.lp(MATCH, dp(56), dp(12)))
            col.addView(HomeView.secondaryButton(c, R.drawable.ms_logout, "End shift / hand over phone") { a.endShift() }, Ui.lp(MATCH, dp(56), dp(10)))
        }
        if (m.fixes.isNotEmpty()) {
            col.addView(Ui.text(c, "Needs fixing", 13f, R.color.ink2), Ui.lp(MATCH, WRAP, dp(22)))
            m.fixes.forEachIndexed { i, (title, button) ->
                col.addView(Ui.row(c, 12).apply {
                    background = Ui.round(c, c.getColor(R.color.warn_soft), 22, c.getColor(R.color.warn_line)); setPadding(dp(16), dp(12), dp(12), dp(12))
                    addView(Ui.icon(c, R.drawable.ms_error, 22, R.color.warn))
                    addView(Ui.text(c, title, 14f, R.color.ink), LinearLayout.LayoutParams(0, WRAP, 1f))
                    addView(Ui.text(c, button, 14f, R.color.on_accent, 700).apply {
                        background = Ui.round(c, c.getColor(R.color.accent_bright), 20); setPadding(dp(14), dp(10), dp(14), dp(10)); isClickable = true; isFocusable = true; setOnClickListener { a.fix(i) }
                    })
                }, Ui.lp(MATCH, WRAP, dp(8)))
            }
        }
        if (m.recent.isNotEmpty()) {
            col.addView(Ui.text(c, "Recent scans", 13f, R.color.ink2), Ui.lp(MATCH, WRAP, dp(22)))
            m.recent.take(5).forEach { r ->
                col.addView(Ui.row(c, 12).apply {
                    setPadding(0, dp(10), 0, dp(10))
                    addView(Ui.icon(c, r.icon, 20, tone(r.tone)))
                    addView(Ui.column(c).apply { addView(Ui.text(c, r.title, 14f, R.color.ink, 500)); addView(Ui.text(c, r.status, 12f, tone(r.tone))) }, LinearLayout.LayoutParams(0, WRAP, 1f))
                    addView(Ui.text(c, r.time, 12f, R.color.ink2))
                })
            }
        }
        col.addView(Ui.text(c, "Phone settings and diagnostics", 15f, R.color.accent_strong, 600).apply {
            setPadding(0, dp(14), 0, dp(14)); isClickable = true; isFocusable = true; setOnClickListener { a.settings() }
        }, Ui.lp(MATCH, WRAP, dp(14)))
        return col
    }

    // ── Me (1d) ───────────────────────────────────────────────────────────────────────────────
    data class Me(val name: String, val signedIn: Boolean, val site: String?, val shiftHours: String, val verified: Int, val details: List<Pair<String, String>>, val theme: String)

    fun me(c: Context, m: Me, onTheme: (String) -> Unit): View {
        val dp = { v: Number -> Ui.dp(c, v) }
        val col = pad(c)
        val initials = m.name.split(Regex("\\s+")).mapNotNull { it.firstOrNull()?.uppercaseChar() }.take(2).joinToString("").ifBlank { "?" }
        col.addView(FrameLayout(c).apply {
            background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(0xFFF0A35A.toInt(), 0xFFB8661A.toInt())).apply { shape = GradientDrawable.OVAL }
            addView(Ui.text(c, initials, 30f, R.color.on_accent, 700).also { Ui.center(it) })
        }, LinearLayout.LayoutParams(dp(88), dp(88)).apply { gravity = Gravity.CENTER_HORIZONTAL; topMargin = dp(8) })
        col.addView(Ui.title(c, m.name, 34f).apply { gravity = Gravity.CENTER }, Ui.lp(MATCH, WRAP, dp(14)))
        col.addView(Ui.text(c, if (m.signedIn) "Guard · on duty" else "Guard · not signed in", 14f, R.color.ink2).apply { gravity = Gravity.CENTER }, Ui.lp(MATCH, WRAP, dp(4)))
        col.addView(FrameLayout(c).apply {
            addView(Ui.row(c, 8).apply {
                fun chip(t: String) = Ui.text(c, t, 13f, R.color.ink, 500).apply { background = Ui.round(c, c.getColor(R.color.chip), 16); setPadding(dp(12), dp(7), dp(12), dp(7)) }
                addView(chip(if (m.signedIn) "On duty" else "Off duty")); m.site?.let { addView(chip(it)) }
            }, FrameLayout.LayoutParams(WRAP, WRAP, Gravity.CENTER))
        }, Ui.lp(MATCH, WRAP, dp(14)))
        val stats = Ui.row(c, 10, Gravity.TOP)
        listOf("Shift hours" to m.shiftHours, "Patrols verified" to m.verified.toString()).forEach { (l, v) ->
            stats.addView(card(c, R.color.card2, R.color.card2_line).apply { addView(Ui.text(c, l, 13f, R.color.ink2)); addView(Ui.text(c, v, 26f, R.color.ink, 600), Ui.lp(MATCH, WRAP, dp(6))) }, LinearLayout.LayoutParams(0, WRAP, 1f))
        }
        col.addView(stats, Ui.lp(MATCH, WRAP, dp(20)))
        val sheet = Ui.column(c).apply { background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(0xFFF0A35A.toInt(), 0xFFC97221.toInt())).apply { cornerRadius = dp(32).toFloat() }; setPadding(dp(20), dp(20), dp(20), dp(20)) }
        sheet.addView(Ui.text(c, "Detailed information", 18f, R.color.on_accent, 700))
        m.details.forEach { (l, v) ->
            sheet.addView(Ui.text(c, l, 12f, R.color.on_accent).apply { alpha = 0.7f }, Ui.lp(MATCH, WRAP, dp(12)))
            sheet.addView(Ui.text(c, v, 16f, R.color.on_accent, 600), Ui.lp(MATCH, WRAP, dp(2)))
        }
        col.addView(sheet, Ui.lp(MATCH, WRAP, dp(16)))
        col.addView(Ui.text(c, "Appearance", 13f, R.color.ink2), Ui.lp(MATCH, WRAP, dp(22)))
        col.addView(Ui.row(c, 8).apply {
            listOf("dark" to "Dark", "light" to "Light", "system" to "Phone setting").forEach { (k, l) ->
                val on = m.theme == k
                addView(Ui.text(c, l, 14f, if (on) R.color.on_strong else R.color.ink, if (on) 600 else 500).apply {
                    gravity = Gravity.CENTER; background = Ui.round(c, c.getColor(if (on) R.color.strong_surface else R.color.chip), 22); setPadding(0, dp(12), 0, dp(12))
                    isClickable = true; isFocusable = true; isSelected = on; setOnClickListener { onTheme(k) }
                }, LinearLayout.LayoutParams(0, WRAP, 1f))
            }
        }, Ui.lp(MATCH, WRAP, dp(8)))
        return col
    }

}
