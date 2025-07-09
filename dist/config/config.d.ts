interface Config {
    nodeEnv: string;
    port: number;
    host: string;
    apiVersion: string;
    database: {
        url: string;
    };
    redis: {
        url: string;
        password?: string | undefined;
    };
    jwt: {
        secret: string;
        expiresIn: string;
        refreshExpiresIn: string;
    };
    cors: {
        origin: string[];
        credentials: boolean;
    };
    rateLimit: {
        windowMs: number;
        max: number;
    };
    payment: {
        stripe: {
            secretKey: string;
            publicKey: string;
            webhookSecret: string;
        };
        square: {
            accessToken: string;
            applicationId: string;
            environment: string;
            webhookSignatureKey: string;
        };
    };
    notifications: {
        twilio: {
            accountSid: string;
            authToken: string;
            phoneNumber: string;
        };
        email: {
            host: string;
            port: number;
            secure: boolean;
            user: string;
            password: string;
            from: string;
        };
    };
    pos: {
        toast: {
            apiUrl: string;
            clientId: string;
            clientSecret: string;
        };
        lightspeed: {
            apiUrl: string;
            clientId: string;
            clientSecret: string;
        };
        micros: {
            apiUrl: string;
            clientId: string;
            clientSecret: string;
        };
    };
    logging: {
        level: string;
        file: string;
    };
    upload: {
        maxFileSize: number;
        allowedTypes: string[];
    };
    business: {
        defaultTimezone: string;
        defaultCurrency: string;
        defaultBookingDuration: number;
        maxPartySize: number;
        advanceBookingDays: number;
    };
}
declare const config: Config;
export { config };
//# sourceMappingURL=config.d.ts.map