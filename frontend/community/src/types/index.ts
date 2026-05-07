export interface User {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  avatar_url: string;
  created_at: string;
  updated_at: string;
}

export interface UserPublic {
  id: string;
  email: string;
  username: string;
  avatar_url: string;
  created_at: string;
}

export interface Topic {
  id: string;
  title: string;
  content: string;
  author_id: string;
  tags: string[];
  likes_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
}

export interface TopicWithAuthor extends Topic {
  author_name: string;
  author_avatar: string;
  liked: boolean;
}

export interface Comment {
  id: string;
  topic_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export interface CommentWithAuthor extends Comment {
  author_name: string;
  author_avatar: string;
}

export interface Tag {
  name: string;
  count: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
