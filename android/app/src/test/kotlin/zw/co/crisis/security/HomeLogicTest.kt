package zw.co.crisis.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import zw.co.crisis.security.ui.HomeEvent
import zw.co.crisis.security.ui.HomeLocation
import zw.co.crisis.security.ui.HomeLogic
import zw.co.crisis.security.ui.HomeState
import zw.co.crisis.security.ui.HomeWindow

class HomeLogicTest {
    private val now = 1_000_000_000L
    private val min = 60_000L
    private fun w(id: String, dueIn: Long, length: Long = 10 * min, done: Boolean = false) = HomeWindow(id, "Gate $id", now + dueIn, now + dueIn + length, null, null, done)
    private fun resolve(windows: List<HomeWindow>, session: Boolean = true, location: Boolean = true, events: List<HomeEvent> = emptyList()) =
        HomeLogic.resolve(session, location, windows, now, now + 600 * min, true, HomeLocation.INSIDE, 2, { 40 }, events)

    @Test fun `no session asks to sign in, before anything else`() = assertTrue(resolve(listOf(w("A", -min)), session = false) is HomeState.SignIn)

    @Test fun `location off wins over an open check, because the scan could not count`() = assertTrue(resolve(listOf(w("A", -min)), location = false) is HomeState.LocationOff)

    @Test fun `an open window shows, with the time left and progress`() {
        val s = resolve(listOf(w("A", -2 * min))) as HomeState.Open
        assertEquals("A", s.window.assignmentId)
        assertEquals(8 * min, s.remainingMs)
        assertEquals(0.8f, HomeLogic.progress(s.remainingMs, s.totalMs), 0.001f)
        assertEquals(40, s.distanceM)
    }

    @Test fun `a future window is never shown - checks are random`() {
        val s = resolve(listOf(w("B", 5 * min)), events = listOf(HomeEvent(HomeEvent.Kind.VERIFIED, "Gate A verified", "22:04")))
        assertTrue(s is HomeState.Clear)
        assertEquals(1, (s as HomeState.Clear).events.size)
    }

    @Test fun `a done window is not shown, and the one closing soonest wins`() {
        val s = resolve(listOf(w("A", -min, done = true), w("B", -min, 30 * min), w("C", -min, 5 * min))) as HomeState.Open
        assertEquals("C", s.window.assignmentId)
    }

    @Test fun `calm state lists at most three events`() {
        val ev = (1..5).map { HomeEvent(HomeEvent.Kind.VERIFIED, "x$it", "") }
        assertEquals(3, (resolve(emptyList(), events = ev) as HomeState.Clear).events.size)
    }

    @Test fun `countdown, greeting and subline read like the design`() {
        assertEquals("12:40", HomeLogic.countdown(12 * min + 40_000))
        assertEquals("00:01", HomeLogic.countdown(1))
        assertEquals("1:05:00", HomeLogic.countdown(65 * min))
        assertEquals("Evening, Tendai", HomeLogic.greeting(22, "Tendai Mapfumo"))
        assertEquals("Morning, Rudo", HomeLogic.greeting(7, "Rudo"))
        assertEquals("Evening", HomeLogic.greeting(2, " "))
        assertEquals("left to scan · Gate B · 40 m away", HomeLogic.subline(w("B", 0).copy(checkpoint = "Gate B"), 40))
        assertEquals("left to scan · Gate B", HomeLogic.subline(w("B", 0).copy(checkpoint = "Gate B"), null))
    }
}
