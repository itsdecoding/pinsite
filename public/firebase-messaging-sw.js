// Service Worker for Firebase Cloud Messaging (FCM) Web Push Notifications
/* eslint-disable no-undef */

// Give the service worker access to Firebase Messaging.
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

// Initialize Firebase with fallback defaults ensuring valid API key (capital O in 7QOc)
const urlParams = new URLSearchParams(self.location.search);
let apiKey = urlParams.get("apiKey") || "AIzaSyDczdM33tbYk1EsKrRYq3xvB9TxRDo7QOc";
if (apiKey.endsWith("7Q0c")) {
  apiKey = apiKey.slice(0, -4) + "7QOc";
}

const projectId = urlParams.get("projectId") || "pinsite-b915a";
const messagingSenderId = urlParams.get("messagingSenderId") || "224548658735";
const appId = urlParams.get("appId") || "1:224548658735:web:02ed8e40ff2d584f94b0da";

try {
  firebase.initializeApp({
    apiKey,
    projectId,
    messagingSenderId,
    appId,
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification?.title || payload.data?.title || "Pinsite Alert";
    const notificationOptions = {
      body: payload.notification?.body || payload.data?.body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      tag: "pinsite-alert",
      renotify: true,
      vibrate: [200, 100, 200],
      data: {
        url: payload.data?.url || payload.fcmOptions?.link || "/studio/comms",
      },
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
  });
} catch (e) {
  console.warn("[SW] Firebase compat initialization warning:", e);
}

// Fallback direct Push API listener for robust delivery across all browsers
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.notification?.title || payload.data?.title || payload.title || "Pinsite Alert";
    const options = {
      body: payload.notification?.body || payload.data?.body || payload.body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      tag: "pinsite-alert",
      renotify: true,
      vibrate: [200, 100, 200],
      data: {
        url: payload.data?.url || payload.data?.link || payload.fcmOptions?.link || "/studio/comms",
      },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification("Pinsite Alert", {
        body: text,
        icon: "/icon.png",
        badge: "/icon.png",
        tag: "pinsite-alert",
        renotify: true,
        data: { url: "/studio/comms" },
      })
    );
  }
});

// Deep-link to conversation when notification is clicked
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/studio/comms";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open with the app, focus it and navigate
      for (const client of windowClients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            return client.navigate(targetUrl);
          }
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
