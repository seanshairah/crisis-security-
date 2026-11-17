package zw.co.crisis.security.ui

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.widget.AppCompatTextView
import androidx.core.content.res.ResourcesCompat
import zw.co.crisis.security.R

/**
 * The guard app's small view kit for screens built in code (handoff v3): Figtree text at a weight, the serif
 * title, rounded panels, icon discs and pills. Fonts are loaded from res/font directly so every Android
 * version from 7.0 gets them, not only those that read fontFamily from the theme.
 */
object Ui {
    fun dp(c: Context, v: Number): Int = (v.toFloat() * c.resources.displayMetrics.density).toInt()
    fun color(c: Context, id: Int) = c.getColor(id)

    private val cache = HashMap<Int, Typeface?>()
    fun font(c: Context, weight: Int): Typeface? {
        val id = when { weight >= 700 -> R.font.figtree_700; weight >= 600 -> R.font.figtree_600; weight >= 500 -> R.font.figtree_500; else -> R.font.figtree_400 }
        return cache.getOrPut(id) { runCatching { ResourcesCompat.getFont(c, id) }.getOrNull() }
    }
    fun serif(c: Context): Typeface? = cache.getOrPut(R.font.instrument_serif_italic) { runCatching { ResourcesCompat.getFont(c, R.font.instrument_serif_italic) }.getOrNull() }

    fun text(c: Context, s: CharSequence, sp: Float, colorRes: Int = R.color.ink, weight: Int = 400): TextView =
        AppCompatTextView(c).apply {
            text = s; setTextSize(TypedValue.COMPLEX_UNIT_SP, sp); setTextColor(c.getColor(colorRes)); typeface = font(c, weight)
            includeFontPadding = false; setLineSpacing(0f, 1.15f)
        }

    fun title(c: Context, s: CharSequence, sp: Float = 30f): TextView =
        AppCompatTextView(c).apply { text = s; setTextSize(TypedValue.COMPLEX_UNIT_SP, sp); setTextColor(c.getColor(R.color.ink)); typeface = serif(c); includeFontPadding = false }

    fun round(c: Context, fill: Int, radiusDp: Number, stroke: Int? = null, strokeDp: Number = 1, dashed: Boolean = false) = GradientDrawable().apply {
        setColor(fill); cornerRadius = dp(c, radiusDp).toFloat()
        if (stroke != null) { if (dashed) setStroke(dp(c, strokeDp), stroke, dp(c, 6).toFloat(), dp(c, 5).toFloat()) else setStroke(dp(c, strokeDp), stroke) }
    }

    fun oval(fill: Int, stroke: Int? = null, strokePx: Int = 0, dashed: Boolean = false, dashPx: Float = 0f) = GradientDrawable().apply {
        shape = GradientDrawable.OVAL; setColor(fill)
        if (stroke != null) { if (dashed) setStroke(strokePx, stroke, dashPx, dashPx * 0.8f) else setStroke(strokePx, stroke) }
    }

    fun icon(c: Context, res: Int, sizeDp: Number, tintRes: Int): ImageView = ImageView(c).apply {
        setImageResource(res); imageTintList = ColorStateList.valueOf(c.getColor(tintRes)); contentDescription = null
        layoutParams = LinearLayout.LayoutParams(dp(c, sizeDp), dp(c, sizeDp))
    }

    fun row(c: Context, gapDp: Number = 8, gravity: Int = Gravity.CENTER_VERTICAL) = LinearLayout(c).apply {
        orientation = LinearLayout.HORIZONTAL; this.gravity = gravity
        dividerDrawable = GradientDrawable().apply { setSize(dp(c, gapDp), 1) }; showDividers = LinearLayout.SHOW_DIVIDER_MIDDLE
    }

    fun column(c: Context) = LinearLayout(c).apply { orientation = LinearLayout.VERTICAL }

    /** A rounded pill: icon + word, coloured by role. */
    fun pill(c: Context, iconRes: Int, label: String, fill: Int, textRes: Int, stroke: Int? = null) = row(c, 8).apply {
        background = round(c, fill, 20, stroke); setPadding(dp(c, 16), dp(c, 8), dp(c, 16), dp(c, 8))
        addView(icon(c, iconRes, 18, textRes)); addView(text(c, label, 14f, textRes, 700))
    }

    fun lp(w: Int, h: Int, top: Int = 0, side: Int = 0) = LinearLayout.LayoutParams(w, h).apply { topMargin = top; marginStart = side; marginEnd = side }
    const val MATCH = LinearLayout.LayoutParams.MATCH_PARENT
    const val WRAP = LinearLayout.LayoutParams.WRAP_CONTENT
    /** Centres [v] in a FrameLayout, keeping any size it already has (an icon's dp size). */
    fun center(v: View) = FrameLayout.LayoutParams(v.layoutParams?.width ?: FrameLayout.LayoutParams.WRAP_CONTENT, v.layoutParams?.height ?: FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER).also { v.layoutParams = it }
}
