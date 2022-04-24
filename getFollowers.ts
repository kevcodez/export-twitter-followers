/**
 * export TWITTER_BEARER_TOKEN=abc
 * npx ts-node getFollowers.ts <username> <optional-limit>
 */

import { TwitterApi, UserV2TimelineResult } from "twitter-api-v2";
import * as fastcsv from "fast-csv";
import fs from "fs";

const twitterClient = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);

const processArguments = process.argv.slice(2);

// Tell typescript it's a readonly app
const roClient = twitterClient.readOnly;

(async () => {
  const username = processArguments[0];
  const maxFollowersToExport = processArguments[1]
    ? Number(processArguments[1])
    : Infinity;

  if (!username) {
    throw new Error("Please provide a username");
  }

  const user = await roClient.v2.userByUsername(username);
  const userId = user.data.id;

  console.log(`Fetching twitter followers for user ${userId}`);

  let followers: any[] = [];

  try {
    let nextToken: string | undefined;
    let dataCanBeFetched = true;

    while (dataCanBeFetched) {
      const pageSize =
        1000 > maxFollowersToExport ? maxFollowersToExport : 1000;
      const userFollowers: UserV2TimelineResult = await roClient.v2.followers(
        userId,
        {
          max_results: pageSize,
        }
      );

      console.log(`Found ${userFollowers.data.length} followers`);

      followers.push(...userFollowers.data);

      nextToken = userFollowers.meta.next_token;
      dataCanBeFetched =
        followers.length < maxFollowersToExport &&
        userFollowers.data.length >= pageSize &&
        userFollowers.meta.next_token !== null;
    }
  } catch (err: any) {
    if (err.code === 429) {
      const rateLimitReset = err.headers["x-rate-limit-reset"];
      console.error(
        "Rate limit exceeded, retry in " +
          new Date(Number(rateLimitReset) * 1000).toLocaleTimeString()
      );
    } else {
      console.error(err);
    }
  }

  if (!followers.length) {
    console.error("No followers to export");
    process.exit(1);
  }

  const ws = fs.createWriteStream(`followers_${username}.csv`);

  const csvStream = fastcsv.format({ headers: true });

  csvStream.pipe(ws).on("end", () => {
    console.log("Write to CSV successfully!");
    process.exit(0);
  });
  followers.forEach((follower) => csvStream.write(follower));
  csvStream.end();
})();
