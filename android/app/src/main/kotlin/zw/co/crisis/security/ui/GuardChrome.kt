package zw.co.crisis.security.ui

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import zw.co.crisis.security.R
import zw.co.crisis.security.data.EventQueue
import zw.co.crisis.security.data.Prefs
import zw.co.crisis.security.patrol.PatrolStore
import zw.co.crisis.security.util.DeviceInfo

/**
 * The frame every guard screen sits in (handoff v3): a warm radial glow on the page, the screen's content scrolling
 * above a fixed footer, and the footer itself, the sync line over a five-tab bar (Home, Patrol, Alerts, Log, Me).
 * Focused screens (scan result, emergency sent) pass no tab and get neither.
 */
class GuardChrome private constructor(private val a: Activity, val root: FrameLayout, private val sync: LinearLayout) {
    enum class Tab(val icon: Int, val label: String) {
        HOME(R.drawable.ms_home, "Home"), PATROL(R.drawable.ms_route, "Patrol"), ALERTS(R.drawable.ms_campaign, "Alerts"),
        LOG(R.drawable.ms_history, "Log"), ME(R.drawable.ms_person, "Me")
    }
    enum class Glow(val color: Int) { ACCENT(R.color.glow_accent), OK(R.color.glow_ok), CRITICAL(R.color.glow_critical) }

    /** Re-reads the outbox and the connection; call it from the screen's own refresh loop. */
    fun refreshSync() {
        val prefs = Prefs(a)
        val pending = runCatching { EventQueue.get(a).counts().pending }.getOrDefault(0) + runCatching { PatrolStore.get(a).pendingCount() }.getOrDefault(0)
        bindSync(a, sync, SyncLine.of(DeviceInfo.isOnline(a), pending, prefs.lastSyncAt.takeIf { it > 0 }?.let { System.currentTimeMillis() - it }))
    }

    /** The frame without an Activity, so snapshot tests draw exactly what ships. */
    class Frame(val root: FrameLayout, val body: View, val footer: LinearLayout, val sync: LinearLayout)

    companion object {
        /** Sync line (40) + hairline (1) + tab row (10 + 52 + 10), plus a little air. */
        const val FOOTER_DP = 121

        fun install(a: Activity, content: View, tab: Tab?, glow: Glow = Glow.ACCENT, scroll: Boolean = true): GuardChrome {
            val f = frame(a, content, tab, glow, scroll) { open(a, it) }
            a.setContentView(f.root)
            // Edge to edge: content takes the status bar, the footer the navigation bar.
            ViewCompat.setOnApplyWindowInsetsListener(f.root) { _, insets ->
                val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
                f.footer.updatePadding(bottom = bars.bottom)
                f.body.updatePadding(top = bars.top, bottom = bars.bottom + if (tab == null) 0 else Ui.dp(a, FOOTER_DP))
                insets
            }
            ViewCompat.requestApplyInsets(f.root)
            return GuardChrome(a, f.root, f.sync).also { if (tab != null) it.refreshSync() }
        }

        fun frame(c: Context, content: View, tab: Tab?, glow: Glow, scroll: Boolean = true, onTab: (Tab) -> Unit): Frame {
            val root = FrameLayout(c).apply { background = page(c, glow) }
            val body: View = if (scroll) ScrollView(c).apply { isFillViewport = true; clipToPadding = false; addView(content) } else content
            root.addView(body, FrameLayout.LayoutParams(-1, -1))
            val footer = Ui.column(c)
            val sync = Ui.row(c, 8, Gravity.CENTER)
            if (tab != null) {
                // Opaque, so text scrolling underneath never shows through the sync line.
                footer.setBackgroundColor(c.getColor(R.color.surface2))
                footer.addView(sync, LinearLayout.LayoutParams(-1, Ui.dp(c, 40)))
                footer.addView(tabBar(c, tab, onTab), LinearLayout.LayoutParams(-1, LinearLayout.LayoutParams.WRAP_CONTENT))
                // Content clears the footer from the first frame; the navigation-bar inset is added on top by install().
                body.updatePadding(bottom = FOOTER_DP.let { Ui.dp(c, it) })
            }
            root.addView(footer, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))
            return Frame(root, body, footer, sync)
        }

        fun page(c: Context, glow: Glow) = LayerDrawable(arrayOf(
            GradientDrawable().apply { setColor(c.getColor(R.color.surface2)) },
            GradientDrawable().apply {
                gradientType = GradientDrawable.RADIAL_GRADIENT
                colors = intArrayOf(c.getColor(glow.color), c.getColor(R.color.surface2) and 0x00FFFFFF)
                gradientRadius = Ui.dp(c, 300).toFloat()
                setGradientCenter(0.5f, 0.3f)
            },
        ))

        fun bindSync(c: Context, sync: LinearLayout, v: SyncLine.View) {
            sync.removeAllViews()
            val tone = if (v.ok) R.color.ok_text else R.color.warn
            sync.setBackgroundColor(if (v.bar) c.getColor(R.color.warn_soft) else 0)
            sync.addView(Ui.icon(c, if (v.ok) R.drawable.ms_cloud_done else R.drawable.ms_cloud_off, 16, tone))
            sync.addView(Ui.text(c, v.text, 12.5f, tone, 500))
            sync.contentDescription = v.text
        }

        private fun tabBar(c: Context, current: Tab, onTab: (Tab) -> Unit): View {
            val wrap = Ui.column(c).apply { setBackgroundColor(c.getColor(R.color.tab_bar)) }
            wrap.addView(View(c).apply { setBackgroundColor(c.getColor(R.color.line)) }, LinearLayout.LayoutParams(-1, Ui.dp(c, 1)))
            val bar = LinearLayout(c).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, Ui.dp(c, 10), 0, Ui.dp(c, 10)) }
            wrap.addView(bar, LinearLayout.LayoutParams(-1, -2))
            for (t in Tab.values()) {
                val on = t == current
                val tone = if (on) R.color.ink else R.color.tab_inactive
                bar.addView(Ui.column(c).apply {
                    gravity = Gravity.CENTER_HORIZONTAL; minimumHeight = Ui.dp(c, 52)
                    addView(Ui.icon(c, t.icon, 26, tone))
                    addView(Ui.text(c, t.label, 11f, tone, if (on) 600 else 500).apply { gravity = Gravity.CENTER; setPadding(0, Ui.dp(c, 3), 0, 0) })
                    isClickable = true; isFocusable = true; isSelected = on; contentDescription = t.label
                    setOnClickListener { if (!on) onTab(t) }
                }, LinearLayout.LayoutParams(0, -2, 1f))
            }
            return wrap
        }

        fun open(a: Activity, t: Tab) {
            val target = when (t) {
                Tab.HOME -> PatrolActivity::class.java; Tab.PATROL -> PatrolSessionActivity::class.java
                Tab.ALERTS -> AlertsActivity::class.java; Tab.LOG -> ShiftLogActivity::class.java; Tab.ME -> MeActivity::class.java
            }
            a.startActivity(Intent(a, target).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_NO_ANIMATION))
            @Suppress("DEPRECATION") a.overridePendingTransition(0, 0)
        }
    }
}
