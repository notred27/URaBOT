const bskyURL = "https://bsky.app"




chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === "user_scrolled" && sender.origin === bskyURL) {
        // Handle Twitter-specific logic here
        // console.log("Handling BlueSky scroll");
    }
});



/**
 * Search for currently loaded tweets in the browser, and make a request to the API for classification
 */
async function getBskyEstimates() {
    /**
     * 
     * @param {*} feedItem 
     * @returns 
     */
    async function constructPayload(feedItem) {
        try {

            // Get the user's twitter handel and display name
            const names = feedItem.querySelectorAll('[aria-label="View profile"]')
            const displayName = names[0].textContent
            const handel = names[1].textContent

            let text = ""
            try {
                text = feedItem.querySelectorAll('.css-146c3p1')[3].textContent
            } catch (error) {
            }


            let likes = ""
            if (feedItem.querySelector('[data-testid="likeCount"]') != null) {
                likes = feedItem.querySelector('[data-testid="likeCount"]').textContent

                if (likes.charAt(likes.length - 1) == 'K') {
                    likes = parseFloat(likes.substring(0, likes.length - 1)) * 1000

                } else if (likes.charAt(likes.length - 1) == 'M') {
                    likes = parseFloat(likes.substring(0, likes.length - 1)) * 1000000
                }
            }

            return [handel, displayName, text, likes]

        } catch (error) {   //TODO: Create a better handler for this
            console.error("Error classifying tweet batch", error)
        }
    }


    function makePsudoId(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
        }
        // Convert to 32bit unsigned integer in base 36 and pad with "0" to ensure length is 7.
        return (hash >>> 0).toString(36).padStart(7, '0');
    }


    const allPromises = [];  // List of promises that will be processed
    // const foundTweets = []; // Local tweets from this batch
    let tweet_dict = await chrome.storage.local.get(['process_tweets']);    // All tweets that have been found so far
    let api_url = await chrome.storage.local.get(['endpoint']);


    // Search through all currently rendered feedItems
    document.querySelectorAll('[data-testid*="feedItem"]').forEach(async feedItem => {

        const payloadValues = await constructPayload(feedItem)

        // Hash over username and feedItem content to create a semi-unique psudoId
        const psudoId = makePsudoId(payloadValues[0] + payloadValues[2]);


        // // TODO: Make this batched to reduce # of connections to the API?
        // // Construct API payload
        const tweetForm = new FormData();
        tweetForm.append('psudo_id', psudoId);     // FIXME: Create actual id for these items
        tweetForm.append('username', payloadValues[0]);
        tweetForm.append('display_name', payloadValues[1]);
        tweetForm.append('tweet_content', payloadValues[2]);
        tweetForm.append('is_verified', "");   // bsky doesn't have verification
        tweetForm.append('likes', payloadValues[3]);

        if (!(psudoId in tweet_dict.process_tweets)) { // Don't rerender processed tweets 
            tweet_dict.process_tweets[psudoId] = -1 // Set val to -1 to signal that this tweet has been found
            await chrome.storage.local.set({ process_tweets: tweet_dict.process_tweets })

            // Create fetch requests to the API endpoint
            const fetchPromise = fetch(api_url.endpoint, {
                method: "POST",
                body: tweetForm,
                mode: "cors"
            })
                .then((response) => {
                    if (response["status"] == 200) {  // Only continue if status is ok
                        return response.json();
                    }
                })
                .then((json) => {
                    // Add each tweet to the array with its prediction
                    tweet_dict.process_tweets[psudoId] = json.percent
                    console.log(json.percent)

                    chrome.storage.local.set({ process_tweets: tweet_dict.process_tweets }).then(() => {
                        chrome.runtime.sendMessage({ message: 'update_tweets' });
                    });

                    // foundTweets.push({ tweetId: psudoId, score: json.percent })
                })
                .catch((err) => {
                    console.error("Exception occurred:", err)
                })

            allPromises.push(fetchPromise);

        } else {
            console.log("already processed", tweet_dict.process_tweets[psudoId])
        }
    });

    // Wait for all promises to resolve, then send the data to local storage
    Promise.all(allPromises)
}
