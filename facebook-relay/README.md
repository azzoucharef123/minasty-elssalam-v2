# Facebook RTMPS Relay

This service receives short WebM chunks from the public host room over an authenticated WebSocket and forwards them to Facebook Live through RTMPS using FFmpeg.

## Railway variables

- `RELAY_JWT_SECRET`: exactly the same strong secret used by the main application `JWT_SECRET`.
- `PORT`: supplied automatically by Railway.

## Main application variables

- `FACEBOOK_RELAY_URL`: public HTTPS URL of this Railway service.
- `JWT_SECRET`: already used by the main application and copied to the relay as `RELAY_JWT_SECRET`.

The Facebook Server URL and Persistent Stream Key are entered by the host only at the moment of starting a broadcast. They are sent over the WebSocket to the relay and are never stored in the database or browser storage.

The service accepts one active broadcast per public room, validates a short-lived JWT issued by the main application, and uses FFmpeg to convert the incoming WebM stream to RTMPS/FLV.
