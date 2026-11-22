package zw.co.crisis.security.patrol

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class GateFormTest {
    private fun filled() = GateForm("ARRIVAL").apply {
        checkpointId = "cp1"; party = "Tafara Grain Traders"; place = "Marondera"; vehicle = "TRUCK"; registration = "AFN 4821"
        items[0] = GateItem("Maize, white", "", "25", "bags")
    }

    @Test fun completeFormHasNoProblems() { assertTrue(filled().complete()) }

    @Test fun stepOneNeedsGatePartyAndPlace() {
        val p = GateForm().problemsStep1()
        assertEquals(setOf("checkpoint", "party", "place"), p.keys)
    }

    @Test fun departureWordsTheQuestionsForDeparture() {
        val f = GateForm("DEPARTURE")
        assertEquals("Enter who is taking the goods", f.problemsStep1()["party"])
        assertEquals("Destination", f.placeLabel)
    }

    @Test fun aVehicleNeedsARegistrationButOnFootDoesNot() {
        val f = filled().apply { registration = "" }
        assertEquals(setOf("registration"), f.problemsStep2().keys)
        f.vehicle = "NONE"
        assertTrue(f.problemsStep2().isEmpty())
        assertEquals("", f.toDetails().getString("registration"))
    }

    @Test fun quantityMustBePositiveAndUnitChosen() {
        val f = filled()
        for (bad in listOf("", "0", "-3", "abc")) { f.items[0].quantity = bad; assertTrue(bad, "quantity0" in f.problemsStep2()) }
        f.items[0].quantity = "2.5"; f.items[0].unit = ""
        assertEquals(setOf("unit0"), f.problemsStep2().keys)
    }

    @Test fun otherNeedsADescription() {
        val f = filled().apply { category = "OTHER" }
        assertEquals(setOf("description0"), f.problemsStep2().keys)
        f.items[0].description = "Generator"
        assertTrue(f.problemsStep2().isEmpty())
    }

    @Test fun movementTimeMustBeRecentAndNotFuture() {
        val f = filled()
        f.occurredAt = System.currentTimeMillis() + 3_600_000
        assertTrue("time" in f.problemsStep1())
        f.occurredAt = System.currentTimeMillis() - 8 * 86_400_000L
        assertTrue("time" in f.problemsStep1())
    }

    @Test fun detailsMatchThePortalContract() {
        val d = filled().apply { deliveryNote = "DN-20418" }.toDetails()
        assertEquals("MAIZE", d.getString("category"))
        assertEquals("DN-20418", d.getString("deliveryNote"))
        assertEquals(25.0, d.getJSONArray("items").getJSONObject(0).getDouble("quantity"), 0.0)
        assertTrue(d.getString("occurredAt").endsWith("Z"))
    }

    @Test fun differencesNameWhatDoesNotMatchTheAnnouncement() {
        val expected = filled().toDetails()
        val seen = filled().apply { items[0].quantity = "24" }
        assertEquals(listOf("Items or counts"), seen.differencesFrom(expected))
        assertTrue(filled().differencesFrom(expected).isEmpty())
        assertTrue(filled().differencesFrom(null).isEmpty())
    }

    @Test fun anAnnouncedMovementPrefillsTheForm() {
        val f = GateForm.from(JSONObject("""{"category":"MACHINERY","party":"Acme","place":"Harare","vehicleType":"OTHER","registration":"X1","items":[{"name":"Pump","quantity":2.0,"unit":"units"}]}"""), "ARRIVAL")
        assertEquals("MACHINERY", f.category)
        assertEquals("TRUCK", f.vehicle)
        assertEquals("2", f.items[0].quantity)
    }
}
