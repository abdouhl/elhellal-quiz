type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

interface Env {
    DB: D1Database;
}

declare namespace App {
    interface Locals extends Runtime {}
}
