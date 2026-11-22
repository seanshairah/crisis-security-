# Installing the Security Gateway app

For the person who looks after the control-room phone. No technical knowledge needed beyond using an Android phone.

**What you need:** an Android phone (Android 7 or newer) with a working SIM card, mobile data or Wi‑Fi, and the `security-gateway-release.apk` file (ask the developer, or see "Building the APK" at the end).

## 1. Register the phone in the portal

1. Sign in to the portal and open **Communications → Gateway phones → Register gateway**.
2. Enter a name (for example _Control Room Phone 01_), the SIM's phone number and, if the phone sits at a site, the site.
3. Click **Register and get activation code**. The page shows the **server address** and a **6-character activation code**. The code is valid for 24 hours; **New code** makes another one.

## 2. Put the APK on the phone

Any of these work:

- Email the file to an account that is set up on the phone and open the attachment.
- Share it over WhatsApp as a document.
- Copy it with a USB cable into the phone's _Download_ folder.

## 3. Allow installing from this source

Open the file. Android asks whether this app (Files, Chrome, WhatsApp…) may install unknown apps. Tap **Settings → Allow from this source**, go back and tap **Install**. On Android 7 the switch is under _Settings → Security → Unknown sources_.

## 4. Open the app and grant permissions

Open **Security Gateway**. It asks for:

| Permission                  | Why                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------- |
| Phone (READ_PHONE_STATE)    | to know when the phone is ringing, in a call or idle                                   |
| Call logs (READ_CALL_LOG)   | to see the caller's number and how long the call lasted                                |
| Notifications (Android 13+) | for the small permanent "Security Gateway · Online" notification that keeps it running |

Tap **Allow** for all of them. If you tapped _Deny_, use the **Grant permissions** button on the app's screen, or Android _Settings → Apps → Security Gateway → Permissions_.

## 5. Enter the server and the activation code

On the first screen:

```
Server:           https://your-portal-domain      (pre-filled; change only if the developer says so)
Activation code:  A8F42X
[ ACTIVATE DEVICE ]
```

After "Activated as Control Room Phone 01" the dashboard appears.

## 6. Stop Android from killing the app

Tap **Allow running in background** and choose _Allow_ / _Don't optimise_. Then, depending on the brand:

- **Samsung:** Settings → Battery → Background usage limits → remove Security Gateway from _Sleeping apps_, add it to _Never sleeping apps_. Turn off _Adaptive battery_ for this phone if calls are missed.
- **Xiaomi / Redmi / Poco:** Settings → Apps → Manage apps → Security Gateway → _Autostart_ on; Battery saver → _No restrictions_. In Recents, lock the app (pull it down to show the padlock).
- **Huawei / Honor:** Settings → Battery → App launch → Security Gateway → switch off _Manage automatically_, enable _Auto-launch_, _Secondary launch_, _Run in background_.
- **Oppo / Realme / OnePlus:** Settings → Battery → App battery management → Security Gateway → _Allow background activity_, _Allow auto-launch_.
- **Tecno / Infinix / Itel:** Settings → Battery → Phone Master / Auto-start manager → enable Security Gateway.
- **Stock Android (Pixel, Nokia, Motorola):** the _Allow running in background_ button is enough.

Also: keep mobile data on (the app uses very little: a few kilobytes per heartbeat), keep the phone charging, and do not use "power saving" modes that turn off data when the screen is off.

Check <https://dontkillmyapp.com> for the exact menus of your model.

## 7. Confirm it is online

The app's dashboard should show **🟢 ONLINE** and _Status: CONNECTED_. In the portal, **Gateway phones** shows the device as _Online_ with "Last seen: a few seconds ago". If not, open the app's **Settings → Test connection**; the message tells you what is wrong (no internet, wrong server, revoked device).

## 8. Make a test call

Call the gateway phone from a guard's registered number. Within a few seconds the portal shows the call under **Calls** (_Ringing_, then _Answered_ or _Missed_, then _Completed_ with a duration). If the number is not a registered guard it appears as _Unknown caller_.

## Everyday use

- The notification "Security Gateway · Online" must stay. Swiping it away is not possible; if it disappears the app was stopped: open it again.
- After a restart the app comes back by itself within a minute. If the brand's settings above were skipped, open the app once after restarting.
- To move the app to another phone: **Gateway phones → the device → Revoke**, then register a new one. A revoked phone shows _DEVICE REVOKED_ and stops sending.
- **Settings → Deactivate device** on the phone forgets the credentials; an administrator still has to revoke it in the portal.

## Building the APK (developer)

```bash
npm run android:sync      # checks the Android SDK and JDK, writes android/local.properties
npm run android:debug     # artifacts/android/security-gateway-debug.apk
npm run android:release   # artifacts/android/security-gateway-release.apk
npm run android:build     # both, plus the unit tests
```

Requirements and signing are in [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md). Without a release keystore the release APK is signed with the debug key: it installs fine for testing, but to update the app later you must keep using the same key, so set up a keystore before rolling out to many phones.
