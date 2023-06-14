import { ApiPromise, WsProvider } from "@polkadot/api";
import fs from "fs";

const chainWsUrl = "wss://failover-ws-quartz.unique.network";
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

const tokens = JSON.parse(fs.readFileSync("tokens.json").toString());
const tokensWithOwners = [];
const contractAddress = "0x5c03d3976ad16f50451d95113728e0229c50cab8";
const lastBlock = 3236661;
async function main() {
  let blockHash = await api.rpc.chain.getBlockHash(lastBlock);
  let tryCount = 0;
  while (tokens.length) {
    const parentBlock = await api.rpc.chain.getBlock(blockHash);

    await readEvents(blockHash);
    blockHash = parentBlock.block.header.parentHash.toString();

    console.log("blocks count", ++tryCount, lastBlock - tryCount);
  }
}

async function readEvents(parentBlockHash) {
  const events = (await api.query.system.events.at(parentBlockHash)).toJSON();
  const transferEvents = events.filter(
    (e) => e.event.section === "common" && e.event.method === "Transfer"
  );
  if (!transferEvents.length) return;

  transferEvents.map((event) => {
    const [collectionId, tokenId, from, to] = event.event.data;

    if (collectionId !== 1 && collectionId !== 2) return;

    if (to.ethereum?.toLowerCase() === contractAddress) {
      saveOwner(collectionId, tokenId, from);
    }
  });
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

main();
