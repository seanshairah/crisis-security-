package zw.co.crisis.security.ui

import android.content.Context
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.InputType
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import zw.co.crisis.security.R
import zw.co.crisis.security.ui.Ui.MATCH
import zw.co.crisis.security.ui.Ui.WRAP

/** Draws guard Home (handoff v3) from a [HomeModel]. Pure view code: no data access, so it renders in snapshot tests. */
object HomeView {
    interface Actions {
        fun scan(window: HomeWindow) {}
        fun bell() {}
        fun openLocationSettings() {}
        fun signIn(guardNo: String, pin: String) {}
    }

    /** The built screen and a way to move the countdown without rebuilding it. */
    class Bound(val view: View, val tick: (remainingMs: Long) -> Unit)

    fun build(c: Context, m: HomeModel, actions: Actions): Bound {
        val dp = { v: Number -> Ui.dp(c, v) }
        val col = Ui.column(c).apply { setPadding(dp(22), dp(14), dp(22), dp(24)) }
        var tick: (Long) -> Unit = {}

        // Header: where and who, and the bell (opens Alerts).
        val header = Ui.row(c, 8)
        header.addView(Ui.column(c).apply {
            addView(Ui.text(c, m.siteLine, 13f, R.color.ink2))
            addView(Ui.title(c, m.greeting, 30f).apply { setPadding(0, dp(2), 0, 0) })
        }, LinearLayout.LayoutParams(0, WRAP, 1f))
        header.addView(FrameLayout(c).apply {
            background = Ui.oval(c.getColor(R.color.chip)); isClickable = true; isFocusable = true; contentDescription = "Alerts"
            addView(Ui.icon(c, R.drawable.ms_notifications, 22, R.color.ink).also { Ui.center(it) })
            setOnClickListener { actions.bell() }
        }, LinearLayout.LayoutParams(dp(48), dp(48)))
        col.addView(header, Ui.lp(MATCH, WRAP))

        m.message?.let { msg ->
            col.addView(Ui.text(c, msg, 14f, if (m.messageIsError) R.color.critical else R.color.ink2, 500).apply {
                gravity = Gravity.CENTER; accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
                if (m.messageIsError) { background = Ui.round(c, c.getColor(R.color.critical_soft), 18); setPadding(dp(14), dp(12), dp(14), dp(12)) }
            }, Ui.lp(MATCH, WRAP, dp(14)))
        }

        when (val s = m.state) {
            is HomeState.Open -> {
                col.addView(centered(c, Ui.pill(c, R.drawable.ms_notifications_active, "Check open now", c.getColor(R.color.accent_bright), R.color.on_accent)), Ui.lp(MATCH, WRAP, dp(22)))
                val ring = RingView(c).apply { trackColor = c.getColor(R.color.ring_track); arcColor = c.getColor(R.color.accent_bright); strokePx = dp(11).toFloat(); progress = HomeLogic.progress(s.remainingMs, s.totalMs) }
                val disc = Ui.column(c).apply {
                    gravity = Gravity.CENTER
                    background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(0xFFF0A35A.toInt(), 0xFFB8661A.toInt())).apply { shape = GradientDrawable.OVAL }
                    addView(Ui.icon(c, R.drawable.ms_qr_code_scanner, 64, R.color.on_accent))
                    addView(Ui.text(c, "Scan now", 26f, R.color.on_accent, 700).apply { setPadding(0, dp(2), 0, 0) })
                    isClickable = true; isFocusable = true; contentDescription = "Scan now, ${s.window.checkpoint}"
                    setOnClickListener { actions.scan(s.window) }
                }
                col.addView(ringFrame(c, ring, disc), Ui.lp(MATCH, WRAP, dp(22)))
                val count = Ui.text(c, HomeLogic.countdown(s.remainingMs), 34f, R.color.ink, 600).apply { gravity = Gravity.CENTER }
                col.addView(count, Ui.lp(MATCH, WRAP, dp(18)))
                col.addView(Ui.text(c, HomeLogic.subline(s.window, s.distanceM), 14f, R.color.ink2).apply { gravity = Gravity.CENTER }, Ui.lp(MATCH, WRAP, dp(6)))
                tick = { ms -> count.text = HomeLogic.countdown(ms); ring.progress = HomeLogic.progress(ms, s.totalMs) }
                if (s.online) {
                    val tiles = Ui.row(c, 10)
                    val (fill, line, icon, label) = when (s.location) {
                        HomeLocation.INSIDE -> Tone(R.color.ok_soft, R.color.ok_line, R.color.ok, R.color.ok_text)
                        HomeLocation.OUTSIDE -> Tone(R.color.critical_soft, R.color.critical, R.color.critical, R.color.critical)
                        HomeLocation.UNKNOWN -> Tone(R.color.warn_soft, R.color.warn_line, R.color.warn, R.color.warn)
                    }
                    tiles.addView(tile(c, R.drawable.ms_my_location, "Location", when (s.location) { HomeLocation.INSIDE -> "Inside site"; HomeLocation.OUTSIDE -> "Outside site"; HomeLocation.UNKNOWN -> "Checking" }, fill, line, icon, label), LinearLayout.LayoutParams(0, WRAP, 1f))
                    tiles.addView(tile(c, R.drawable.ms_check_circle, "Tonight", "${s.checksDone} ${if (s.checksDone == 1) "check" else "checks"} done", R.color.ok_soft, R.color.ok_line, R.color.ok, R.color.ok_text), LinearLayout.LayoutParams(0, WRAP, 1f))
                    col.addView(tiles, Ui.lp(MATCH, WRAP, dp(18)))
                } else {
                    col.addView(note(c), Ui.lp(MATCH, WRAP, dp(18)))
                }
            }
            is HomeState.Clear -> {
                col.addView(centered(c, Ui.pill(c, R.drawable.ms_check_circle, "No check open", c.getColor(R.color.ok_soft), R.color.ok_text, c.getColor(R.color.ok_line))), Ui.lp(MATCH, WRAP, dp(22)))
                val ring = RingView(c).apply { trackColor = c.getColor(R.color.ok_line); dashed = true; strokePx = dp(2).toFloat() }
                val disc = Ui.column(c).apply {
                    gravity = Gravity.CENTER; background = Ui.oval(c.getColor(R.color.ok_soft), c.getColor(R.color.ok_line), dp(1))
                    addView(Ui.icon(c, R.drawable.ms_verified_user, 64, R.color.ok))
                    addView(Ui.text(c, "All clear", 22f, R.color.ink, 600).apply { setPadding(0, dp(4), 0, 0) })
                    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES; contentDescription = "All clear. No check is open."
                }
                col.addView(ringFrame(c, ring, disc), Ui.lp(MATCH, WRAP, dp(22)))
                col.addView(Ui.text(c, "Your next check comes at a random time. We will alert you, so keep the phone on you.", 15f, R.color.ink2).apply { gravity = Gravity.CENTER; setLineSpacing(0f, 1.3f) }, Ui.lp(MATCH, WRAP, dp(18), dp(18)))
                if (s.events.isNotEmpty()) col.addView(events(c, s.events), Ui.lp(MATCH, WRAP, dp(18)))
            }
            is HomeState.LocationOff -> {
                val card = Ui.column(c).apply { background = Ui.round(c, c.getColor(R.color.warn_soft), 28, c.getColor(R.color.warn_line)); setPadding(dp(20), dp(20), dp(20), dp(20)) }
                card.addView(Ui.row(c, 12).apply { addView(Ui.icon(c, R.drawable.ms_location_off, 32, R.color.warn)); addView(Ui.text(c, "Location is off", 19f, R.color.ink, 600)) })
                card.addView(Ui.text(c, bold(c, "Scans can't be checked, so they won't count as verified. Turn on ", "Location → Allow all the time", ".", R.color.ink), 14f, R.color.warn_text).apply { setLineSpacing(0f, 1.35f) }, Ui.lp(MATCH, WRAP, dp(10)))
                card.addView(primaryButton(c, R.drawable.ms_settings, "Open phone settings") { actions.openLocationSettings() }, Ui.lp(MATCH, dp(56), dp(14)))
                col.addView(card, Ui.lp(MATCH, WRAP, dp(16)))
                val still = Ui.column(c).apply { background = Ui.round(c, c.getColor(R.color.surface), 24, c.getColor(R.color.line)); setPadding(dp(18), dp(16), dp(18), dp(16)) }
                still.addView(Ui.text(c, "Still working", 13f, R.color.ink2))
                listOf(Triple(R.drawable.ms_check_circle, R.color.ok, "Emergency button"), Triple(R.drawable.ms_check_circle, R.color.ok, "Calling operations"), Triple(R.drawable.ms_pause_circle, R.color.warn, "Checkpoint scans (need location)")).forEach { (i, t, l) ->
                    still.addView(Ui.row(c, 10).apply { addView(Ui.icon(c, i, 20, t)); addView(Ui.text(c, l, 14f)) }, Ui.lp(MATCH, WRAP, dp(10)))
                }
                col.addView(still, Ui.lp(MATCH, WRAP, dp(14)))
            }
            HomeState.SignIn -> {
                col.addView(Ui.text(c, "Start your shift", 22f, R.color.ink, 600), Ui.lp(MATCH, WRAP, dp(26)))
                col.addView(Ui.text(c, "Enter your guard number and PIN. You need a connection to sign in; after that the phone works offline.", 14f, R.color.ink2).apply { setLineSpacing(0f, 1.3f) }, Ui.lp(MATCH, WRAP, dp(6)))
                val guard = field(c, "Guard number", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS)
                val pin = field(c, "6–12 digit PIN", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD)
                col.addView(guard, Ui.lp(MATCH, dp(56), dp(18))); col.addView(pin, Ui.lp(MATCH, dp(56), dp(10)))
                col.addView(primaryButton(c, R.drawable.ms_login, "Sign in for shift") { val p = pin.text.toString(); pin.text.clear(); actions.signIn(guard.text.toString(), p) }, Ui.lp(MATCH, dp(60), dp(16)))
            }
        }
        return Bound(col, tick)
    }

    private data class Tone(val fill: Int, val line: Int, val icon: Int, val label: Int)

    private fun ringFrame(c: Context, ring: RingView, disc: View) = FrameLayout(c).apply {
        val outer = Ui.dp(c, 262); val inner = Ui.dp(c, 208)
        addView(ring, FrameLayout.LayoutParams(outer, outer, Gravity.CENTER))
        addView(disc, FrameLayout.LayoutParams(inner, inner, Gravity.CENTER))
        minimumHeight = outer
    }

    private fun centered(c: Context, v: View) = FrameLayout(c).apply { addView(v, FrameLayout.LayoutParams(WRAP, WRAP, Gravity.CENTER)) }

    private fun tile(c: Context, iconRes: Int, label: String, value: String, fill: Int, line: Int, iconTint: Int, labelTint: Int) = Ui.row(c, 8).apply {
        background = Ui.round(c, c.getColor(fill), 18, c.getColor(line)); setPadding(Ui.dp(c, 12), Ui.dp(c, 10), Ui.dp(c, 12), Ui.dp(c, 10))
        addView(Ui.icon(c, iconRes, 20, iconTint))
        addView(Ui.column(c).apply { addView(Ui.text(c, label, 11f, labelTint, 500)); addView(Ui.text(c, value, 13f, R.color.ink, 500)) })
        contentDescription = "$label: $value"
    }

    private fun note(c: Context) = Ui.row(c, 12).apply {
        background = Ui.round(c, c.getColor(R.color.warn_soft), 22, c.getColor(R.color.warn_line)); setPadding(Ui.dp(c, 16), Ui.dp(c, 14), Ui.dp(c, 16), Ui.dp(c, 14))
        addView(Ui.icon(c, R.drawable.ms_cloud_off, 26, R.color.warn))
        addView(Ui.text(c, bold(c, "Scan anyway. It shows ", "Saved offline · awaiting confirmation", " and sends when you are back online.", R.color.warn), 13.5f, R.color.warn_text).apply { setLineSpacing(0f, 1.3f) }, LinearLayout.LayoutParams(0, WRAP, 1f))
    }

    private fun events(c: Context, list: List<HomeEvent>) = Ui.column(c).apply {
        background = Ui.round(c, c.getColor(R.color.surface), 22, c.getColor(R.color.line)); setPadding(Ui.dp(c, 16), Ui.dp(c, 4), Ui.dp(c, 16), Ui.dp(c, 4))
        list.forEachIndexed { i, e ->
            val (icon, tint) = when (e.kind) {
                HomeEvent.Kind.VERIFIED -> R.drawable.ms_check_circle to R.color.ok
                HomeEvent.Kind.ARRIVED -> R.drawable.ms_login to R.color.ok
                HomeEvent.Kind.SAVED -> R.drawable.ms_cloud_off to R.color.warn
                HomeEvent.Kind.PROBLEM -> R.drawable.ms_error to R.color.critical
            }
            if (i > 0) addView(View(c).apply { setBackgroundColor(c.getColor(R.color.line)) }, LinearLayout.LayoutParams(MATCH, Ui.dp(c, 1)))
            addView(Ui.row(c, 10).apply {
                setPadding(0, Ui.dp(c, 11), 0, Ui.dp(c, 11))
                addView(Ui.icon(c, icon, 20, tint))
                addView(Ui.text(c, e.title, 14f), LinearLayout.LayoutParams(0, WRAP, 1f))
                addView(Ui.text(c, e.time, 12f, R.color.ink2))
            })
        }
    }

    fun primaryButton(c: Context, iconRes: Int?, label: String, onClick: () -> Unit) = Ui.row(c, 8, Gravity.CENTER).apply {
        background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(0xFFF0A35A.toInt(), 0xFFC97221.toInt())).apply { cornerRadius = Ui.dp(c, 30).toFloat() }
        if (iconRes != null) addView(Ui.icon(c, iconRes, 22, R.color.on_accent))
        addView(Ui.text(c, label, 16f, R.color.on_accent, 700))
        isClickable = true; isFocusable = true; contentDescription = label
        setOnClickListener { onClick() }
    }

    fun secondaryButton(c: Context, iconRes: Int?, label: String, onClick: () -> Unit) = Ui.row(c, 8, Gravity.CENTER).apply {
        background = Ui.round(c, c.getColor(R.color.chip), 28)
        if (iconRes != null) addView(Ui.icon(c, iconRes, 20, R.color.ink))
        addView(Ui.text(c, label, 15f, R.color.ink, 500))
        isClickable = true; isFocusable = true; contentDescription = label
        setOnClickListener { onClick() }
    }

    private fun field(c: Context, hint: String, type: Int) = EditText(c).apply {
        this.hint = hint; inputType = type; setTextColor(c.getColor(R.color.ink)); setHintTextColor(c.getColor(R.color.ink3)); textSize = 16f
        typeface = Ui.font(c, 500); background = Ui.round(c, c.getColor(R.color.chip), 18); setPadding(Ui.dp(c, 18), 0, Ui.dp(c, 18), 0)
    }

    private fun bold(c: Context, before: String, strong: String, after: String, strongColor: Int): CharSequence = SpannableStringBuilder(before).apply {
        val start = length; append(strong)
        setSpan(StyleSpan(Typeface.BOLD), start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        setSpan(ForegroundColorSpan(c.getColor(strongColor)), start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        append(after)
    }

}
