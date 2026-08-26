export type VideoFormat = {
  itag: number;
  quality: string;
  height: number;
  fps: number;
  container: string;
  url: string;
};

export type AudioFormat = {
  itag: number;
  bitrate: number;
  container: string;
  url: string;
};

export type VideoInfo = {
  url: string;
  video: {
    id: string;
    title: string;
    duration: number;
    views: number;
    likes: number | null;
    uploadDate: string | null;
    description: string;
    thumbnail: string | null;
    category: string | null;
  };
  channel: {
    id: string | null;
    name: string;
    verified: boolean;
    subscribers: number | null;
    avatar: string | null;
    url: string | null;
  };
  videoFormats: VideoFormat[];
  audioFormats: AudioFormat[];
};

export type StatPoint = {
  at: number;
  views: number;
  likes: number | null;
  subs: number | null;
};

export type TrackedItem = {
  id: string;
  url: string;
  title: string;
  thumbnail: string | null;
  channel: string;
  addedAt: number;
  history: StatPoint[];
};
