// sw.js  —  Service Worker for push notifications
// Place this file at the ROOT of your website (e.g. /public/sw.js)
// It must be served from the same domain as your profile page.

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    data = { title: 'New follow-up reminder', body: event.data.text() }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/icon-192.png',   // add your own icon
      badge:   '/badge-72.png',   // small monochrome icon
      tag:     data.contactId,    // replaces old notification for same contact
      renotify: false,
      data:    { url: data.url ?? '/crm' },
      actions: [
        { action: 'open', title: 'Open CRM' },
        { action: 'dismiss', title: 'Dismiss' },
      ]
    })
  )
})

// When user taps the notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return

  const url = event.notification.data?.url ?? '/crm'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If app is already open, focus it
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      // Otherwise open a new window
      return clients.openWindow(url)
    })
  )
})
