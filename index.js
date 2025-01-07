import pg from "pg";
import express from "express";
import {createServer} from "node:http";
import bodyParser from "body-parser";
import cors from "cors";
import {Server} from "socket.io";
import {createAdapter} from "@socket.io/postgres-adapter";
import {logger} from "./src/logger.js";
import {format, transports} from "winston";
import dotenv from "dotenv";

dotenv.config();

logger.add(
    new transports.Console({
        format: format.combine(format.colorize(), format.splat(), format.simple()),
    }),
);


function createExpressApp(config) {
    const app = express();

    app.set("etag", false);
    app.set("x-powered-by", false);

    app.use(bodyParser.json());
    app.use(cors(config));

    return app;
}


const config = {
    postgres: {
        connectionString: process.env.SH_CONNECTION_STRING,
        options: "-c search_path=sync",
    },
    cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["Content-Type"],
    }
}

const pgPool = new pg.Pool(config.postgres);

const httpServer = createServer();
const app = createExpressApp(config.cors);

httpServer.on("request", app);

const io = new Server(httpServer, {
    cors: config.cors,
    adapter: createAdapter(pgPool),
});


function InitSocketHandlers ( ioServer ) {
    ioServer.on("connection", (socket) => {
        socket.on("message", (payload, callback) => {
            logger.info("message received: %o", payload);
            const completed = socket.broadcast.emit("client::listen::updates", payload);
            console.log(completed);
        });
        socket.on("subscribe", (payload, callback) => {
            logger.info("subscribe received: %o", payload);
            socket.broadcast.emit("joined", payload);
        });
    });
}



InitSocketHandlers(io);



async function close() {
    await io.close();
    await io.of("/").adapter.close();
    await pgPool.end();
}


process.on("SIGTERM", async () => {
    logger.info("SIGTERM signal received");

    await close();
});

httpServer.listen(process.env.PORT, process.env.HOST,() => {
    logger.info(`server listening on ${process.env.HOST}${process.env.PORT}`);
});