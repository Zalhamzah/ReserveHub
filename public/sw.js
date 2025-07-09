// Service Worker for ReserveHub PWA
const CACHE_NAME = 'reservehub-v1';
const API_CACHE_NAME = 'reservehub-api-v1';

// Assets to cache for offline functionality
const STATIC_CACHE_URLS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    '/favicon.svg',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// API endpoints to cache
const API_URLS = [
    '/api/v1/health',
    '/api/v1/health/detailed'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    
    event.waitUntil(
        Promise.all([
            // Cache static assets
            caches.open(CACHE_NAME).then((cache) => {
                console.log('Caching static assets');
                return cache.addAll(STATIC_CACHE_URLS);
            }),
            // Cache API responses
            caches.open(API_CACHE_NAME).then((cache) => {
                console.log('Caching API responses');
                return Promise.all(
                    API_URLS.map(url => {
                        return fetch(url)
                            .then(response => response.ok ? cache.put(url, response) : null)
                            .catch(err => console.log('Failed to cache:', url, err));
                    })
                );
            })
        ]).then(() => {
            console.log('Service Worker installed successfully');
            // Force activation of new service worker
            return self.skipWaiting();
        })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('Service Worker activated successfully');
            // Take control of all clients
            return self.clients.claim();
        })
    );
});

// Fetch event - handle network requests
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Handle API requests
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(handleApiRequest(request));
    }
    // Handle static assets
    else if (request.method === 'GET') {
        event.respondWith(handleStaticRequest(request));
    }
});

// Handle API requests with network-first strategy
async function handleApiRequest(request) {
    const cache = await caches.open(API_CACHE_NAME);
    
    try {
        // Try network first
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache successful responses
            cache.put(request, networkResponse.clone());
            return networkResponse;
        }
        
        // If network fails, try cache
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // If no cache, return network response (even if not ok)
        return networkResponse;
        
    } catch (error) {
        console.log('Network request failed, trying cache:', error);
        
        // Network failed, try cache
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // If no cache available, return offline response
        return new Response(
            JSON.stringify({
                error: 'Network unavailable',
                message: 'Please check your internet connection',
                offline: true
            }),
            {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

// Handle static requests with cache-first strategy
async function handleStaticRequest(request) {
    const cache = await caches.open(CACHE_NAME);
    
    // Try cache first
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        // If not in cache, fetch from network
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache successful responses
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
        
    } catch (error) {
        console.log('Failed to fetch static resource:', error);
        
        // For HTML requests, return offline page
        if (request.headers.get('Accept').includes('text/html')) {
            return new Response(
                `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>ReserveHub - Offline</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { 
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                            margin: 0;
                            background: #f8fafc;
                            color: #1e293b;
                        }
                        .offline-container {
                            text-align: center;
                            padding: 2rem;
                            background: white;
                            border-radius: 1rem;
                            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                            max-width: 400px;
                        }
                        .offline-icon {
                            font-size: 4rem;
                            margin-bottom: 1rem;
                        }
                        .offline-title {
                            font-size: 1.5rem;
                            font-weight: 600;
                            margin-bottom: 1rem;
                        }
                        .offline-message {
                            color: #64748b;
                            margin-bottom: 2rem;
                        }
                        .retry-button {
                            background: #2563eb;
                            color: white;
                            border: none;
                            padding: 0.75rem 1.5rem;
                            border-radius: 0.5rem;
                            cursor: pointer;
                            font-size: 1rem;
                        }
                        .retry-button:hover {
                            background: #1d4ed8;
                        }
                    </style>
                </head>
                <body>
                    <div class="offline-container">
                        <div class="offline-icon">📱</div>
                        <h1 class="offline-title">You're Offline</h1>
                        <p class="offline-message">
                            Please check your internet connection and try again.
                        </p>
                        <button class="retry-button" onclick="window.location.reload()">
                            Try Again
                        </button>
                    </div>
                </body>
                </html>
                `,
                {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'text/html' }
                }
            );
        }
        
        // For other requests, return generic offline response
        return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

// Handle background sync for offline bookings
self.addEventListener('sync', (event) => {
    console.log('Background sync event:', event.tag);
    
    if (event.tag === 'booking-sync') {
        event.waitUntil(syncBookings());
    }
});

// Sync pending bookings when online
async function syncBookings() {
    try {
        // Get pending bookings from IndexedDB
        const pendingBookings = await getPendingBookings();
        
        for (const booking of pendingBookings) {
            try {
                // Try to submit booking
                const response = await fetch('/api/v1/bookings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(booking.data)
                });
                
                if (response.ok) {
                    // Remove from pending bookings
                    await removePendingBooking(booking.id);
                    
                    // Notify user of successful sync
                    await showNotification('Booking Confirmed', {
                        body: 'Your reservation has been confirmed!',
                        icon: '/icon-192x192.png',
                        tag: 'booking-success'
                    });
                }
            } catch (error) {
                console.error('Failed to sync booking:', error);
            }
        }
    } catch (error) {
        console.error('Background sync failed:', error);
    }
}

// Push notification handler
self.addEventListener('push', (event) => {
    console.log('Push notification received:', event);
    
    if (event.data) {
        const notificationData = event.data.json();
        
        event.waitUntil(
            showNotification(notificationData.title, {
                body: notificationData.body,
                icon: notificationData.icon || '/icon-192x192.png',
                badge: '/icon-192x192.png',
                tag: notificationData.tag || 'default',
                data: notificationData.data,
                actions: notificationData.actions || []
            })
        );
    }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    console.log('Notification clicked:', event);
    
    event.notification.close();
    
    // Handle notification actions
    if (event.action === 'view') {
        event.waitUntil(
            clients.openWindow('/reservations')
        );
    } else if (event.action === 'book') {
        event.waitUntil(
            clients.openWindow('/?shortcut=book')
        );
    } else {
        // Default action - open the app
        event.waitUntil(
            clients.matchAll({ type: 'window' }).then((clientList) => {
                // If app is already open, focus it
                for (const client of clientList) {
                    if (client.url === '/' && 'focus' in client) {
                        return client.focus();
                    }
                }
                // If app is not open, open it
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
        );
    }
});

// Helper function to show notifications
async function showNotification(title, options = {}) {
    return self.registration.showNotification(title, {
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        vibrate: [100, 50, 100],
        ...options
    });
}

// Helper functions for IndexedDB operations (simplified)
async function getPendingBookings() {
    // In a real implementation, this would use IndexedDB
    // For now, return empty array
    return [];
}

async function removePendingBooking(bookingId) {
    // In a real implementation, this would remove from IndexedDB
    console.log('Removing pending booking:', bookingId);
}

// Message handler for communication with main thread
self.addEventListener('message', (event) => {
    console.log('Service Worker received message:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Cache update notifications
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({
            version: CACHE_NAME
        });
    }
});

console.log('Service Worker loaded successfully'); 