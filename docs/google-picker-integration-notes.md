# Google Picker integration notes

- Google Picker lets a web app present a Drive file-selection dialog and returns the selected file metadata to the app.
- The existing OAuth scope `https://www.googleapis.com/auth/drive.file` is sufficient with Google Picker: the user chooses the file to share with the app, keeping access limited per file.
- The web integration requires the Google Picker JavaScript library, a short-lived OAuth access token, a browser API key restricted to the production site origin, and the Google Cloud project number as the Picker app ID.
- The app must continue to request `drive.file` both in Google Cloud Data Access and in browser code. No broad `drive.readonly` scope is needed.
- Selected Drive video metadata should be saved to the level repository; video bytes never transit through Railway.

Sources:
- https://developers.google.com/workspace/drive/picker/guides/overview
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
