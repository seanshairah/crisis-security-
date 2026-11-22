# Installing the app on a guard's phone

For supervisors setting up an Android guard. The control-room phone has its own guide: [ANDROID_INSTALLATION.md](ANDROID_INSTALLATION.md).

**Needs:** Android 7 or newer, a SIM in the guard's name on the number saved on their profile, location (GPS) working, some mobile data from time to time. The app uses roughly 2 MB of data per month of shifts.

1. **Register the device.** Portal → Communications → Devices → Register device. Mode: _Guard device_. Choose the guard, enter their phone number, leave the location empty. Click Register; note the 6-character code (valid 24 hours).
2. **Give the site coordinates.** Locations → the site → Edit → Position and geofence: latitude, longitude, radius. Without coordinates the phone cannot judge inside or outside and reports _site has no coordinates_.
3. **Install the APK** (`security-gateway-release.apk`): share it to the phone, open it, allow installing from that source, Install.
4. **Open the app, enter the server and the code**, tap ACTIVATE DEVICE. The app knows it is a guard phone.
5. **Go through the five permission cards** with the guard: Location → Allow; Location all the time → Open settings → Permissions → Location → _Allow all the time_; Phone and call log → Allow; Notifications → Allow; Run in background → Allow. Tap Start.
6. **Battery settings** per brand: see step 6 of ANDROID_INSTALLATION.md. Ask the guard to keep location switched on and the phone charged.
7. **Check in the portal.** Devices shows the phone online with _Location: Allowed all the time_. The guard's profile shows _Android guard_. The app shows _NOT ON SHIFT_ until ten minutes before the next shift, then _WAITING FOR SHIFT_ and _INSIDE SITE_.
8. **Test with a shift.** Create a short shift for the guard at the site. In the app, Sync now; within a minute the shift and radius appear and the first location check runs. The shift page in the portal shows _Monitoring started_ and the map.

Tell the guard, in their words: the app checks where the phone is only during shifts, so the control room knows they are on post; it reports calls; it never listens. The permanent notification must stay.

Removing a guard device: Devices → the device → Revoke. The guard goes back to feature-phone mode and SMS continues as normal.
