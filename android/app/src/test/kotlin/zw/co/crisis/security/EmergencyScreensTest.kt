package zw.co.crisis.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import zw.co.crisis.security.patrol.ScanOutcome
import zw.co.crisis.security.ui.DeliveryTrail
import zw.co.crisis.security.ui.DeliveryTrail.StepState.DONE
import zw.co.crisis.security.ui.DeliveryTrail.StepState.FAILED
import zw.co.crisis.security.ui.DeliveryTrail.StepState.WAITING
import zw.co.crisis.security.ui.HoldMath

class EmergencyScreensTest {
    private fun states(status: String?) = DeliveryTrail.steps(status).map { it.state }

    @Test fun `a queued alert is only saved; nothing is claimed as received`() {
        assertEquals(listOf(DONE, WAITING, WAITING), states("QUEUED"))
        assertEquals(listOf(DONE, WAITING, WAITING), states(null))
        assertFalse(DeliveryTrail.delivered("QUEUED"))
    }

    @Test fun `sent means received, and acknowledged needs a person`() {
        assertEquals(listOf(DONE, DONE, WAITING), states("SENT"))
        assertEquals(listOf(DONE, DONE, DONE), states("ACKNOWLEDGED"))
        assertEquals(listOf(DONE, DONE, DONE), states("RESOLVED"))
        assertTrue(DeliveryTrail.delivered("SENT"))
    }

    @Test fun `a failed delivery is shown as failed, not as waiting`() {
        assertEquals(listOf(DONE, FAILED, WAITING), states("FAILED"))
        assertFalse(DeliveryTrail.delivered("FAILED"))
    }

    @Test fun `the hold ring fills over two seconds and resumes rather than restarts`() {
        assertEquals(0f, HoldMath.progress(0), 0f)
        assertEquals(0.5f, HoldMath.progress(1000), 0.0001f)
        assertEquals(1f, HoldMath.progress(5000), 0f)
        assertEquals(1000L, HoldMath.remainingMs(0.5f))
        assertEquals(0L, HoldMath.remainingMs(1f))
        assertEquals(180f, HoldMath.sweepDegrees(0.5f), 0.0001f)
        assertEquals(360f, HoldMath.sweepDegrees(3f), 0f)
    }

    @Test fun `a scan is amber only while nothing is wrong`() {
        assertEquals(ScanOutcome.VERIFIED, ScanOutcome.of("ACCEPTED", "LOCAL_MATCH"))
        assertEquals(ScanOutcome.SAVED, ScanOutcome.of(null, "LOCAL_MATCH"))
        assertEquals(ScanOutcome.SAVED, ScanOutcome.of(null, null))
        assertEquals(ScanOutcome.PROBLEM, ScanOutcome.of(null, "OUTSIDE_CHECKPOINT"))
        assertEquals(ScanOutcome.PROBLEM, ScanOutcome.of("OUTSIDE_CHECKPOINT", "LOCAL_MATCH"))
        assertEquals(ScanOutcome.PROBLEM, ScanOutcome.of("DELAYED_REVIEW", null))
    }
}
