package zw.co.crisis.security.ui

import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.res.ResourcesCompat
import com.google.android.material.button.MaterialButton
import zw.co.crisis.security.R
import zw.co.crisis.security.data.Prefs
import zw.co.crisis.security.patrol.PatrolStore

/**
 * "Me": who is signed in on this company phone, this shift's hours and patrols, and the phone's details.
 * Read-only, built from what the phone already holds (the session config and its own settings), so it works offline.
 */
class MeActivity : AppCompatActivity() {
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun panel(color: Int, radius: Int = 24) = GradientDrawable().apply { setColor(color); cornerRadius = dp(radius).toFloat(); setStroke(dp(1), getColor(R.color.line)) }
    private fun text(s: String, size: Float, color: Int = R.color.ink, bold: Boolean = false) = TextView(this).apply {
        text = s; textSize = size; setTextColor(getColor(color)); if (bold) setTypeface(typeface, Typeface.BOLD)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = Prefs(this)
        val session = PatrolStore.get(this).config()?.optJSONObject("session")?.takeIf { System.currentTimeMillis() < PatrolStore.time(it.getString("expiresAt")) }
        val scroll = ScrollView(this).apply { setBackgroundColor(getColor(R.color.surface2)); isFillViewport = true }
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(20), dp(20), dp(24)) }
        scroll.addView(col); setContentView(scroll); Insets.applySystemBars(scroll)

        val name = session?.optString("guardName")?.takeIf { it.isNotBlank() } ?: prefs.guardName.ifBlank { "No guard signed in" }
        col.addView(text(name, 34f).apply { typeface = ResourcesCompat.getFont(this@MeActivity, R.font.display) })
        col.addView(text(if (session != null) "Guard · signed in on this phone" else "Sign in from the patrol screen", 14f, R.color.ink2))

        // Two figures for this shift.
        val stats = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val hours = session?.let { ((PatrolStore.time(it.getString("expiresAt")) - PatrolStore.time(it.getString("startedAt"))) / 3_600_000.0) }
        val assignments = session?.optJSONArray("assignments")
        val verified = assignments?.let { a -> (0 until a.length()).count { a.getJSONObject(it).optString("status") == "COMPLETED" } } ?: 0
        listOf("Shift hours" to (hours?.let { String.format(java.util.Locale.getDefault(), "%.1f h", it) } ?: "—"), "Patrols verified" to verified.toString()).forEachIndexed { i, (label, value) ->
            stats.addView(LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL; background = panel(getColor(R.color.surface)); setPadding(dp(16), dp(16), dp(16), dp(16))
                addView(text(label, 12f, R.color.ink3)); addView(text(value, 26f))
                layoutParams = LinearLayout.LayoutParams(0, -2, 1f).apply { if (i > 0) marginStart = dp(10) }
            })
        }
        col.addView(stats, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(20) })

        // Details sheet, in the accent tint the handoff uses for it.
        val sheet = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; background = panel(getColor(R.color.accent_soft), 32); setPadding(dp(20), dp(20), dp(20), dp(20)) }
        sheet.addView(text("Detailed information", 18f, bold = true))
        listOf(
            "Duty site" to (session?.optString("siteName")?.takeIf { it.isNotBlank() } ?: prefs.dutySiteName.ifBlank { "—" }),
            "Shift ends" to (session?.let { android.text.format.DateFormat.getTimeFormat(this).format(java.util.Date(PatrolStore.time(it.getString("expiresAt")))) } ?: "—"),
            "Phone" to prefs.phoneNumber.ifBlank { "—" },
            "Device" to prefs.deviceName.ifBlank { "—" },
        ).forEach { (label, value) ->
            sheet.addView(text(label, 12f, R.color.ink3).apply { setPadding(0, dp(12), 0, 0) })
            sheet.addView(text(value, 16f))
        }
        col.addView(sheet, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(16) })

        col.addView(MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            text = "Back"; isAllCaps = false; minHeight = dp(52); cornerRadius = dp(28); setOnClickListener { finish() }
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(20) })
    }
}
