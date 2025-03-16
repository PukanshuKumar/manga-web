const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const sharp = require("sharp"); // Import sharp

const app = express();
app.use(cors());

const BASE_URL = "https://api.mangadex.org";
const SERVER_URL = "http://localhost:5000";

const fetchWithTimeout = async (url, options = {}, timeout = 10000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
};


const fetchWithRetry = async (url, options = {}, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetchWithTimeout(url, options);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`Retrying (${i + 1}/${retries})...`);
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
        }
    }
};




app.get("/proxy-image", async (req, res) => {
    try {
        const imageUrl = req.query.url;
        // const response = await fetch(imageUrl, {
        const response = await fetchWithRetry(imageUrl, {
            headers: {
                "Referer": "https://mangadex.org",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"
            }
        });

        if (!response.ok) throw new Error("Failed to fetch image");

        const imageBuffer = await response.buffer(); // Convert image to buffer

        // Resize image using sharp (Example: Resize to 300px width)
        const resizedImage = await sharp(imageBuffer)
            .resize({ width: 150 }) // Resize width to 300px (adjust as needed)
            .jpeg({ quality: 80 }) // Reduce JPEG quality
            .toBuffer(); // Convert back to buffer

        // res.set("Content-Type", response.headers.get("Content-Type"));
        res.set("Content-Type", "image/jpeg"); // Ensure proper MIME type
        res.send(resizedImage); // Send resized image
    } catch (error) {
        res.status(500).json({ error: "Failed to load image" });
    }
});

// 📌 Get Latest Manga (With Cover Image, Author, Chapters, Ratings & Tags)
app.get("/latest-manga", async (req, res) => {
    try {
        let offset = req.query.offset || 0; // Pagination support
        const response = await fetchWithRetry(`${BASE_URL}/manga?order[latestUploadedChapter]=desc&limit=10&offset=${offset}`);
        // const response = await fetch(`${BASE_URL}/manga?order[latestUploadedChapter]=desc&limit=10&offset=${offset}`);
        const mangaData = await response.json();

        // Process each manga to include cover, author, chapters, rating & tags
        const mangaList = await Promise.all(mangaData.data.map(async (manga) => {
            // 🔹 Get Cover Image
            const coverId = manga.relationships.find(rel => rel.type === "cover_art")?.id;
            // const coverUrl = coverId ? `https://uploads.mangadex.org/covers/${manga.id}/${coverId}.jpg` : "https://via.placeholder.com/150";

            // Get Cover Image start
            let coverUrl = "https://via.placeholder.com/150"; // Default placeholder

            const coverRel = manga.relationships.find(rel => rel.type === "cover_art");
            if (coverRel) {
                const coverResponse = await fetchWithRetry(`${BASE_URL}/cover/${coverRel.id}`);
                // const coverResponse = await fetch(`${BASE_URL}/cover/${coverRel.id}`);
                const coverData = await coverResponse.json();
                const coverFilename = coverData.data?.attributes?.fileName;
                if (coverFilename) {
                    // const originalCoverUrl = `https://uploads.mangadex.org/covers/${manga.id}/${coverFilename}`;
        // coverUrl = `${SERVER_URL}/proxy-image?url=${encodeURIComponent(originalCoverUrl)}`;
                    // coverUrl = `https://uploads.mangadex.org/covers/${manga.id}/${coverFilename}.{256, 512}.jpg`;
                    coverUrl = `https://uploads.mangadex.org/covers/${manga.id}/${coverFilename}`;
                }
            }
            // Get Cover Image end

            // 🔹 Get Author Name (Fetch separately)
            const authorRel = manga.relationships.find(rel => rel.type === "author" || rel.type === "artist");
            let author = "Unknown";
            if (authorRel) {
                const authorResponse = await fetchWithRetry(`${BASE_URL}/author/${authorRel.id}`);
                // const authorResponse = await fetch(`${BASE_URL}/author/${authorRel.id}`);
                const authorData = await authorResponse.json();
                author = authorData.data?.attributes?.name || "Unknown";
            }

            // 🔹 Fetch Last 3 Chapters
            const chapterResponse = await fetchWithRetry(`${BASE_URL}/chapter?manga=${manga.id}&limit=3&translatedLanguage[]=en&order[chapter]=desc`);
            // const chapterResponse = await fetch(`${BASE_URL}/chapter?manga=${manga.id}&limit=3&translatedLanguage[]=en&order[chapter]=desc`);
            const chapterData = await chapterResponse.json();
            const lastThreeChapters = chapterData.data.map(ch => ({
                chapter: ch.attributes.chapter || "N/A",
                title: ch.attributes.title || "",
                id: ch.id,
                updatedAt: ch.attributes.readableAt || "Unknown Date"
            }));

            // 🔹 Get Tags
            const tags = manga.attributes.tags.map(tag => tag.attributes.name.en);

            // 🔹 Get Follows (Fix Follow Count & Estimate Rating)
            const statsResponse = await fetchWithRetry(`${BASE_URL}/statistics/manga/${manga.id}`);
            // const statsResponse = await fetch(`${BASE_URL}/statistics/manga/${manga.id}`);
            const statsData = await statsResponse.json();
            const follows = statsData.statistics[manga.id]?.follows || 0;
            // const rating = statsData.statistics[manga.id]?.rating?.average?.toFixed(1) || "N/A";
            const rawRating = statsData.statistics[manga.id]?.rating?.average || 0;
            const rating = rawRating ? (rawRating / 2).toFixed(1) : "N/A"; // Convert to 5-point scale

            // 🔹 Determine Popularity Tag (SS, HOT, NEW)
            let tag = "";
            if (follows > 50000) tag = "ss"; // Super Star
            else if (follows > 10000) tag = "hot";

            // Check if the manga is new (published in the last 30 days)
            if (manga.attributes.createdAt) {
                const createdAt = new Date(manga.attributes.createdAt);
                const now = new Date();
                const daysSinceCreated = (now - createdAt) / (1000 * 60 * 60 * 24);
                if (daysSinceCreated < 30) tag = "new";
            }

            return {
                id: manga.id,
                title: manga.attributes.title.en || "No Title",
                // cover: `/proxy-image?url=${encodeURIComponent(coverUrl)}`,
                cover: `${SERVER_URL}/proxy-image?url=${encodeURIComponent(coverUrl)}`,
                // cover: coverUrl,
                author: author,
                chapters: lastThreeChapters,
                tags: tags,
                rating: rating,
                popularityTag: tag // "SS", "HOT", or "NEW"
            };
        }));

        res.json(mangaList);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch manga data" });
    }
});


app.get("/new-manga", async (req, res) => {
    try {
        let offset = req.query.offset || 0;
        const response = await fetchWithRetry(`${BASE_URL}/manga?order[latestUploadedChapter]=desc&limit=100&offset=${offset}`);
        // const response = await fetch(`${BASE_URL}/manga?order[latestUploadedChapter]=desc&limit=100&offset=${offset}`);
        const mangaData = await response.json();

        const now = new Date();

        // Filter manga from last 30 days
        let newMangaList = mangaData.data.filter(manga => {
            const createdAt = new Date(manga.attributes.createdAt);
            return (now - createdAt) / (1000 * 60 * 60 * 24) < 30;
        });

        // Ensure at least 10 manga
        if (newMangaList.length < 10) {
            let olderManga = mangaData.data.filter(manga => !newMangaList.includes(manga));
            newMangaList = [...newMangaList, ...olderManga.slice(0, 10 - newMangaList.length)];
        }

        // Process manga
        newMangaList = await Promise.all(newMangaList.map(async (manga) => {
            // Get Cover
            const coverRel = manga.relationships.find(rel => rel.type === "cover_art");
            let coverUrl = "https://via.placeholder.com/150";

            if (coverRel) {
                try {
                    const coverResponse = await fetchWithRetry(`${BASE_URL}/cover/${coverRel.id}`);
                    // const coverResponse = await fetch(`${BASE_URL}/cover/${coverRel.id}`);
                    const coverData = await coverResponse.json();
                    if (coverData.data?.attributes?.fileName) {
                        coverUrl = `https://uploads.mangadex.org/covers/${manga.id}/${coverData.data.attributes.fileName}`;
                    }
                } catch (err) {
                    console.error("Failed to fetch cover:", err);
                }
            }

            // Get Author
            let author = "Unknown";
            const authorRel = manga.relationships.find(rel => rel.type === "author" || rel.type === "artist");
            if (authorRel) {
                try {
                    const authorResponse = await fetchWithRetry(`${BASE_URL}/author/${authorRel.id}`);
                    // const authorResponse = await fetch(`${BASE_URL}/author/${authorRel.id}`);
                    const authorData = await authorResponse.json();
                    author = authorData.data?.attributes?.name || "Unknown";
                } catch (err) {
                    console.error("Failed to fetch author:", err);
                }
            }

            // Get Last 3 Chapters
            let lastThreeChapters = [];
            try {
                const chapterResponse = await fetchWithRetry(`${BASE_URL}/chapter?manga=${manga.id}&limit=3&translatedLanguage[]=en&order[chapter]=desc`);
                // const chapterResponse = await fetch(`${BASE_URL}/chapter?manga=${manga.id}&limit=3&translatedLanguage[]=en&order[chapter]=desc`);
                const chapterData = await chapterResponse.json();
                lastThreeChapters = chapterData.data.map(ch => ({
                    chapter: ch.attributes.chapter || "N/A",
                    title: ch.attributes.title || "",
                    id: ch.id,
                    updatedAt: ch.attributes.readableAt || "Unknown Date"
                }));
            } catch (err) {
                console.error("Failed to fetch chapters:", err);
            }

            // Get Tags
            const tags = manga.attributes.tags.map(tag => tag.attributes.name.en);

            // Get Follow Count & Rating
            let follows = 0, rating = "N/A";
            try {
                const statsResponse = await fetchWithRetry(`${BASE_URL}/statistics/manga/${manga.id}`);
                // const statsResponse = await fetch(`${BASE_URL}/statistics/manga/${manga.id}`);
                const statsData = await statsResponse.json();
                follows = statsData.statistics[manga.id]?.follows || 0;
                const rawRating = statsData.statistics[manga.id]?.rating?.average || 0;
                rating = rawRating ? (rawRating / 2).toFixed(1) : "N/A";
            } catch (err) {
                console.error("Failed to fetch stats:", err);
            }

            // Determine Popularity Tag
            let tag = "";
            if (follows > 50000) tag = "ss";
            else if (follows > 10000) tag = "hot";
            if ((now - new Date(manga.attributes.createdAt)) / (1000 * 60 * 60 * 24) < 30) tag = "new";

            return {
                id: manga.id,
                title: manga.attributes.title.en || "No Title",
                cover: coverUrl,
                author: author,
                chapters: lastThreeChapters,
                tags: tags,
                rating: rating,
                popularityTag: tag
            };
        }));

        res.json(newMangaList.slice(0, 10));
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "Failed to fetch new manga" });
    }
});




// 📌 Get Manga Details (With Cover Image, Latest Chapter, Author, Tags, Popularity)
app.get("/manga/:id", async (req, res) => {
    try {
        const mangaId = req.params.id;

        // 🔹 Fetch Manga Details
        const mangaResponse = await fetchWithRetry(`${BASE_URL}/manga/${mangaId}`);
        // const mangaResponse = await fetch(`${BASE_URL}/manga/${mangaId}`);
        const mangaData = await mangaResponse.json();
        if (!mangaData.data) return res.status(404).json({ error: "Manga not found" });

        const manga = mangaData.data;

        // 🔹 Fetch Cover Image
        let coverUrl = "https://via.placeholder.com/150"; // Default image
        const coverRel = manga.relationships.find(rel => rel.type === "cover_art");
        if (coverRel) {
            const coverResponse = await fetchWithRetry(`${BASE_URL}/cover/${coverRel.id}`);
            // const coverResponse = await fetch(`${BASE_URL}/cover/${coverRel.id}`);
            const coverData = await coverResponse.json();
            if (coverData.data?.attributes?.fileName) {
                coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${coverData.data.attributes.fileName}`;
            }
        }

        // 🔹 Fetch Alternative Titles
        // const altTitles = manga.attributes.altTitles.map(obj => Object.values(obj)[0]);
        const altTitles = manga.attributes.altTitles?.length > 0 ? manga.attributes.altTitles.map(obj => Object.values(obj)[0]): [];


        // 🔹 Fetch Author(s)
        const authors = await Promise.all(
            manga.relationships
                .filter(rel => rel.type === "author" || rel.type === "artist")
                .map(async (rel) => {
                    const authorResponse = await fetchWithRetry(`${BASE_URL}/author/${rel.id}`);
                    // const authorResponse = await fetch(`${BASE_URL}/author/${rel.id}`);
                    const authorData = await authorResponse.json();
                    return authorData.data?.attributes?.name || "Unknown";
                })
        );

        // 🔹 Get Manga Status (Ongoing/Completed)
        const status = manga.attributes.status.charAt(0).toUpperCase() + manga.attributes.status.slice(1);

        // 🔹 Get Genres (Tags)
        const genres = manga.attributes.tags.map(tag => tag.attributes.name.en);


        let follows = 0, rating = "N/A";
        try {
            // const statsResponse = await fetch(`${BASE_URL}/statistics/manga/${manga.id}`);
            const statsResponse = await fetchWithRetry(`${BASE_URL}/statistics/manga/${manga.id}`);
            const statsData = await statsResponse.json();
            if (statsData.statistics && statsData.statistics[manga.id]) {
                follows = statsData.statistics[manga.id].follows || 0;
                const rawRating = statsData.statistics[manga.id].rating?.average || 0;
                rating = rawRating ? (rawRating / 2).toFixed(1) : "N/A";
            }
        } catch (error) {
            console.error("Error fetching manga stats:", error);
        }

        // 🔹 Fetch Statistics (Follows & Ratings)
        // const statsResponse = await fetch(`${BASE_URL}/statistics/manga/${mangaId}`);
        // const statsData = await statsResponse.json();
        // const follows = statsData.statistics?.[mangaId]?.follows || 0; // Followers count
        // const rawRating = statsData.statistics?.[mangaId]?.rating?.average || 0;
        // const rating = rawRating ? (rawRating / 2).toFixed(1) : "N/A"; // Convert to 5-star rating
        const totalLikes = statsData.statistics?.[mangaId]?.rating?.count || 0; // Total Likes



        // 🔹 Determine Popularity Tag (SS, HOT, NEW)
        let popularityTag = "";
        if (follows > 50000) popularityTag = "ss"; // Super Star
        else if (follows > 10000) popularityTag = "hot";

        // Check if the manga is new (published in the last 30 days)
        if (manga.attributes.createdAt) {
            const createdAt = new Date(manga.attributes.createdAt);
            const now = new Date();
            const daysSinceCreated = (now - createdAt) / (1000 * 60 * 60 * 24);
            if (daysSinceCreated < 30) popularityTag = "new";
        }

        // 🔹 Fetch Latest Update Time (Formatted)
        const updatedAt = new Date(manga.attributes.updatedAt);
        const formattedUpdateTime = updatedAt.toLocaleString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        });

        // 🔹 Fetch All Chapters
        const chaptersResponse = await fetchWithRetry(`${BASE_URL}/chapter?manga=${mangaId}&translatedLanguage[]=en&order[chapter]=desc&limit=100`);
        // const chaptersResponse = await fetch(`${BASE_URL}/chapter?manga=${mangaId}&translatedLanguage[]=en&order[chapter]=desc&limit=100`);
        const chaptersData = await chaptersResponse.json();
        const chapters = chaptersData.data.map(ch => ({
            id: ch.id,
            chapterNumber: ch.attributes.chapter || "N/A",
            title: ch.attributes.title || "",
            views: Math.floor(Math.random() * 5000) + 1000, // Fake views (Mangadex doesn’t provide views)
            uploadedTime: new Date(ch.attributes.readableAt).toLocaleString("en-US", {
                month: "short",
                day: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true
            })
        }));

        // 🔹 Send Response
        res.json({
            id: mangaId,
            title: manga.attributes.title.en || "No Title",
            cover: coverUrl,
            description: manga.attributes.description.en || "No Description",
            alternativeTitles: altTitles,
            authors: authors,
            status: status,
            genres: genres,
            lastUpdated: formattedUpdateTime,
            views: follows,
            rating: rating,
            totalLikes: totalLikes,
            popularityTag: popularityTag, // Added Popularity Tag
            chapters: chapters
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch manga details" });
    }
});



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
