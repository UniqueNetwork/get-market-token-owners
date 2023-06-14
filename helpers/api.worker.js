import { expose } from 'threads/worker';
import { parentPort } from 'worker_threads';
import {ApiPromise, WsProvider} from "@polkadot/api";

async function connectListener(message) {
    if (typeof message === 'object' && 'chainWsUrl' in message) {
        const { chainWsUrl } = message;
        let provider = new WsProvider(chainWsUrl);
        provider.on("connected", (err) => {
            console.log("worker provider connected");
        });
        provider.on("error", (err) => {
            console.log("worker provider error", err.message, err);
        });
        provider.on("disconnected", (...args) => {
            console.log("worker provider disconnected", ...args);
            provider.connect();
        });

        const api = await ApiPromise.create({ provider });
        api.on("error", (err) => {
            console.log("worker api error", err.message, err);
        });
        api.on("disconnected", (...args) => {
            console.log("worker api disconnected", ...args);
        });
        parentPort.postMessage('connected');
        parentPort.removeListener('message', connectListener);
        expose({
            getBlockHash: (...args) => {
                return api.rpc.chain.getBlockHash(...args).then(b => b.toJSON());
            },
            getBlock: (...args) => {
                return api.rpc.chain.getBlock(...args).then(b => b.toJSON());
            },
            getEvents: (...args) => {
                return api.query.system.events.at(...args).then(r => r.toJSON());
            },
            getHead: () => {
                return api.rpc.chain.getHeader().then(head => head.toJSON());
            },
        });
        // todo connection error
    }
}

parentPort.once('message', connectListener);
