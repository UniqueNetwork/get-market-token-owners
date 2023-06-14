import fs from "fs";
import { setFlagsFromString } from 'v8';
import { EventEmitter } from 'events';
import { Pool, Worker, spawn } from "threads";
import { cpus } from 'os';

const chainWsUrl = "wss://failover-ws-quartz.unique.network";

const tokens = JSON.parse(fs.readFileSync("tokens.json").toString());
const tokensWithOwners = [];
const contractAddress = "0x5c03d3976ad16f50451d95113728e0229c50cab8";

async function getConnectableWorker(chainWsUrl) {
  const worker = new Worker('./helpers/api.worker.js');

  await new Promise((resolve) => {
    const connectedListener = (event) => {
      if (event?.data === 'connected') {
        resolve(); // todo error
        worker.removeEventListener('message', connectedListener);
      }
    };

    worker.addEventListener('message', connectedListener);
    worker.postMessage({
      chainWsUrl,
    });
  });

  return worker;
}

async function initPool() {
  const concurrency = 5;
  EventEmitter.defaultMaxListeners = concurrency + 1;
  setFlagsFromString('--stack_size=10000');
  const pool = Pool(
      async () => {
        const worker = await getConnectableWorker(
            chainWsUrl,
        );
        return spawn(worker);
      },
      {
        size: cpus().length,
        concurrency: 5,
      },
  );

  try {
    await new Promise((resolve) => {
      pool
          .events()
          .filter((e) => e.type === 'initialized')
          .subscribe(resolve);
    });

  } catch (e) {
    console.error(e);
  }

  return {
    getBlockHash: (...args) => pool.queue((worker) => worker['getBlockHash'](...args)),
    getBlock: (...args) => pool.queue((worker) => worker['getBlock'](...args)),
    getEvents: (...args) => pool.queue((worker) => worker['getEvents'](...args)),
    getHead: () => pool.queue((worker) => worker['getHead']()),
  }
}


async function main() {
  const api = await initPool();
  const { number } = await api.getHead();
  let blockHash = await api.getBlockHash(number);
  let tryCount = 0;
  while (tokens.length) {
    const parentBlock = await api.getBlock(blockHash);
    readEvents(blockHash, api).then();
    blockHash = parentBlock.block.header.parentHash.toString();
    console.log("blocks count", ++tryCount, number - tryCount);
  }
}

async function readEvents(blockHash, api) {
  const events = await api.getEvents(blockHash);
  const event = events.find(
    (e) => e.event.section === "common" && e.event.method === "Transfer"
  );
  if (!event) return;

  const collectionId = event.event.data[0];
  const tokenId = event.event.data[1];
  const owner = event.event.data[2];
  if (collectionId !== 1 && collectionId !== 2) return;

  if (event.event.data[3].ethereum?.toLowerCase() === contractAddress) {
    saveOwner(collectionId, tokenId, owner);
  }
}

function saveOwner(collectionId, tokenId, owner) {
  const token = tokens.find(
    (t) => t.collectionId === collectionId && t.tokenId === tokenId
  );
  if (!token) return;
  const index = tokens.indexOf(token);
  tokens.splice(index, 1);

  const tokenWithOwner = tokensWithOwners.find(
    (t) => t.collectionId === collectionId && t.tokenId === tokenId
  );

  if (!tokenWithOwner) {
    tokensWithOwners.push({
      ...token,
      owner,
    });

    console.log("tokens", tokens.length, tokensWithOwners.length);

    fs.writeFileSync(
      "tokens-with-owners.json",
      JSON.stringify(tokensWithOwners, null, 2)
    );
  }

  if (!tokens.length) {
    console.log("complete");
    process.exit();
  }
}

main().then();
