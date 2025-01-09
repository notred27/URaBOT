const twitterURL = "https://x.com"



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === "user_scrolled" && sender.origin === twitterURL) {
        // Handle Twitter-specific logic here
        console.log("Handling Twitter scroll");
    }
});




/**
 * Search for currently loaded tweets in the browser, and make a request to the API for classification
 */
async function getTwitterEstimates() {
    /**
     * 
     * @param {*} tweet 
     * @returns 
     */
    async function constructPayload(tweet) {
        try {

            // Get the user's twitter handel and display name
            const handle = tweet.querySelector('[data-testid="User-Name"]').textContent.split("@");
            const name = handle[0]                      // The display name
            const username = handle[1].split("·")[0]    // The @ name 

            // Get user's verification status
            let isVerified = false;
            if (tweet.querySelector('[aria-label="Verified account"]') != null) {
                isVerified = true
            }

            // Get the content of the user's tweet
            var tweetText = ""
            if (tweet.querySelector('[data-testid="tweetText"') != null) {
                tweetText = tweet.querySelector('[data-testid="tweetText"').textContent
            }

            // Format likes to integers
            var likes = ""
            if (tweet.querySelector('[data-testid="like"') != null) {
                likes = tweet.querySelector('[data-testid="like"').textContent

                if (likes.charAt(likes.length - 1) == 'K') {
                    likes = parseFloat(likes.substring(0, likes.length - 1)) * 1000

                } else if (likes.charAt(likes.length - 1) == 'M') {
                    likes = parseFloat(likes.substring(0, likes.length - 1)) * 1000000
                }
            }

            return [username, name, tweetText, isVerified, likes]

        } catch (error) {   //TODO: Create a better handler for this
            console.error("Error classifying tweet batch", error)
        }
    }


    const allPromises = [];  // List of promises that will be processed
    // const foundTweets = []; // Local tweets from this batch
    let tweet_dict = await chrome.storage.local.get(['process_tweets']);    // All tweets that have been found so far
    let api_url = await chrome.storage.local.get(['endpoint']);


    // Search through all currently rendered tweets
    document.querySelectorAll('[data-testid="tweet"]').forEach(async tweet => {
        const psudoId = tweet.getAttribute("aria-labelledby").split(" ")[0];

        if (!(psudoId in tweet_dict.process_tweets)) { // Don't rerender processed tweets 

            tweet_dict.process_tweets[psudoId] = -1 // Set val to -1 to signal that this tweet has been found
            await chrome.storage.local.set({ process_tweets: tweet_dict.process_tweets })


            const payloadValues = await constructPayload(tweet)

            // TODO: Make this batched to reduce # of connections to the API?
            // Construct API payload
            const tweetForm = new FormData();
            tweetForm.append('psudo_id', psudoId);
            tweetForm.append('username', payloadValues[0]);
            tweetForm.append('display_name', payloadValues[1]);
            tweetForm.append('tweet_content', payloadValues[2]);
            tweetForm.append('is_verified', payloadValues[3]);
            tweetForm.append('likes', payloadValues[4]);


            // Create fetch requests to the API endpoint
            const fetchPromise = fetch(api_url.endpoint, {
                method: "POST",
                body: tweetForm,
            })
                .then((response) => {
                    if (response["status"] == 200) {  // Only continue if status is ok
                        return response.json();
                    }
                })
                .then((json) => {
                    // Add each tweet to the array with its prediction
                    tweet_dict.process_tweets[psudoId] = json.percent

                    chrome.storage.local.set({ process_tweets: tweet_dict.process_tweets }).then(() => {
                        chrome.runtime.sendMessage({ message: 'update_tweets' });
                    });

                    // foundTweets.push({ tweetId: psudoId, score: json.percent })
                })
                .catch((err) => {
                    if (!err instanceof TypeError) {
                        // This is the response for querying a processed tweet / in process tweet

                        console.error("Exception occurred:", err)
                    }

                })

            allPromises.push(fetchPromise);

        }
    });

    // Wait for all promises to resolve, then send the data to local storage
    Promise.all(allPromises)
}
