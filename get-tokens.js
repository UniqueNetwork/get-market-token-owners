import { Sdk } from "@unique-nft/sdk/full";
import fs from "fs";

const sdk = new Sdk({
  baseUrl: "https://rest.unique.network/quartz/v1",
});
const contractAddress = "0x5c03d3976ad16f50451d95113728e0229c50cab8";

async function main() {
  const tokensResult = await Promise.all(
    [1, 2].map((id) =>
      sdk.token.accountTokens({
        collectionId: id,
        address: contractAddress,
      })
    )
  );

  const tokens = tokensResult
    .map((res) => res.tokens)
    .flat()
    .sort((t1, t2) => {
      if (t1.collectionId < t2.collectionId) return -1;
      if (t1.collectionId > t2.collectionId) return 1;
      if (t1.tokenId < t2.tokenId) return -1;
      if (t1.tokenId > t2.tokenId) return 1;
    });

  console.log(`found ${tokens.length} tokens`);
  fs.writeFileSync("tokens.json", JSON.stringify(tokens, null, 2));
}

main();
