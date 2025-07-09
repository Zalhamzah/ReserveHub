import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
declare let io: SocketIOServer;
export declare const initializeWebSocket: (server: HttpServer) => SocketIOServer<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
export declare const websocketEvents: {
    bookingCreated: (businessId: string, booking: any) => void;
    bookingUpdated: (businessId: string, booking: any) => void;
    bookingCancelled: (businessId: string, booking: any) => void;
    waitlistUpdated: (businessId: string, waitlistEntry: any) => void;
    tableStatusChanged: (businessId: string, table: any) => void;
    userNotification: (userId: string, notification: any) => void;
    businessNotification: (businessId: string, notification: any) => void;
    availabilityUpdated: (businessId: string, update: any) => void;
};
export { io };
//# sourceMappingURL=websocket.d.ts.map