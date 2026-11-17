package zw.co.crisis.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import zw.co.crisis.security.ui.SyncLine

class SyncLineTest {
    @Test fun `online with nothing waiting is green and says when`() {
        val v = SyncLine.of(true, 0, 30_000)
        assertTrue(v.ok); assertFalse(v.bar); assertEquals("Up to date · synced just now", v.text)
        assertEquals("Up to date · synced 4 min ago", SyncLine.of(true, 0, 4 * 60_000).text)
    }

    @Test fun `no signal is amber and counts what is saved`() {
        val v = SyncLine.of(false, 3, 30_000)
        assertFalse(v.ok); assertTrue(v.bar); assertEquals("No signal · 3 saved, will send when online", v.text)
    }

    @Test fun `online but still sending is amber, never green`() {
        assertFalse(SyncLine.of(true, 1, 0).ok)
        assertEquals("Sending 1 saved item…", SyncLine.of(true, 1, 0).text)
    }
}
