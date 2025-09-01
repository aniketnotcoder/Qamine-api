const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();

// Use a static User-Agent to avoid fake-useragent issues on cloud
const userAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';

// Environment variable for optional proxy: PROXY_URL=host:port
const jsongen = async (url) => {
  try {
    const headers = {
      'X-Signature-Version': 'web2',
      'X-Signature': crypto.randomBytes(32).toString('hex'),
      'User-Agent': userAgent,
    };

    const proxyUrl = process.env.PROXY_URL || null;

    const res = await axios.get(url, {
      headers,
      proxy: proxyUrl
        ? {
            host: proxyUrl.split(':')[0],
            port: parseInt(proxyUrl.split(':')[1]),
          }
        : undefined,
    });

    return res.data;
  } catch (error) {
    console.error('API fetch error:', error.message);
    return null; // Return null on failure instead of throwing
  }
};

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});

// Safely get trending
const getTrending = async (time, page) => {
  const trendingUrl = `https://hanime.tv/api/v8/browse-trending?time=${time}&page=${page}&order_by=views&ordering=desc`;
  const urldata = await jsongen(trendingUrl);
  if (!urldata || !urldata.hentai_videos) return [];
  return urldata.hentai_videos.map((x) => ({
    id: x.id,
    name: x.name,
    slug: x.slug,
    cover_url: x.cover_url,
    views: x.views,
    link: `/watch/${x.slug}`,
  }));
};

// Safely get video
const getVideo = async (slug) => {
  const videoApiUrl = `https://hanime.tv/api/v8/video?id=${slug}`;
  const videoData = await jsongen(videoApiUrl);
  if (!videoData || !videoData.hentai_video) return [];
  const tags = (videoData.hentai_tags || []).map((t) => ({
    name: t.text,
    link: `/hentai-tags/${t.text}/0`,
  }));
  const streams =
    (videoData.videos_manifest?.servers[0]?.streams || []).map((s) => ({
      width: s.width,
      height: s.height,
      size_mbs: s.filesize_mbs,
      url: s.url,
    })) || [];
  const episodes =
    (videoData.hentai_franchise_hentai_videos || []).map((e) => ({
      id: e.id,
      name: e.name,
      slug: e.slug,
      cover_url: e.cover_url,
      views: e.views,
      link: `/watch/${e.slug}`,
    })) || [];
  return [
    {
      id: videoData.hentai_video.id,
      name: videoData.hentai_video.name,
      description: videoData.hentai_video.description,
      poster_url: videoData.hentai_video.poster_url,
      cover_url: videoData.hentai_video.cover_url,
      views: videoData.hentai_video.views,
      streams,
      tags,
      episodes,
    },
  ];
};

// Browse data
const getBrowse = async () => {
  const browseUrl = 'https://hanime.tv/api/v8/browse';
  return (await jsongen(browseUrl)) || {};
};

// Browse videos safely
const getBrowseVideos = async (type, category, page) => {
  const browseUrl = `https://hanime.tv/api/v8/browse/${type}/${category}?page=${page}&order_by=views&ordering=desc`;
  const browsedata = await jsongen(browseUrl);
  if (!browsedata || !browsedata.hentai_videos) return [];
  return browsedata.hentai_videos.map((x) => ({
    id: x.id,
    name: x.name,
    slug: x.slug,
    cover_url: x.cover_url,
    views: x.views,
    link: `/watch/${x.slug}`,
  }));
};

// Routes
app.get('/watch/:slug', async (req, res) => {
  const data = await getVideo(req.params.slug);
  res.json({ results: data });
});

app.get('/trending/:time/:page', async (req, res) => {
  const data = await getTrending(req.params.time, req.params.page);
  const nextPage = `/trending/${req.params.time}/${parseInt(req.params.page) + 1}`;
  res.json({ results: data, next_page: nextPage });
});

app.get('/browse/:type', async (req, res) => {
  const { type } = req.params;
  const data = await getBrowse();
  let jsondata = data[type] || [];
  if (type === 'hentai_tags') {
    jsondata = jsondata.map((x) => ({ ...x, url: `/hentai-tags/${x.text}/0` }));
  } else if (type === 'brands') {
    jsondata = jsondata.map((x) => ({ ...x, url: `test${x.slug}/0` }));
  }
  res.json({ results: jsondata });
});

app.get('/tags', async (req, res) => {
  const data = await getBrowse();
  const jsondata = (data.hentai_tags || []).map((x) => ({ ...x, url: `/tags/${x.text}/0` }));
  res.json({ results: jsondata });
});

app.get('/:type/:category/:page', async (req, res) => {
  const { type, category, page } = req.params;
  const data = await getBrowseVideos(type, category, page);
  const nextPage = `/${type}/${category}/${parseInt(page) + 1}`;
  res.json({ results: data, next_page: nextPage });
});

app.get('/', (req, res) => res.send('Welcome to Hanime Api 👀'));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
