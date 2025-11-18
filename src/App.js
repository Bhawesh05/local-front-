import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import './App.css';

// Initialize Supabase with fallback values
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://rjzojhsugnmqwnsbpzzp.supabase.co';
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqem9qaHN1Z25tcXduc2JwenpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMDI5MjUsImV4cCI6MjA3ODc3ODkyNX0.eTb334q2nQVI5NVB0bj6CgutTsHlBg-6OjhJkdQht0A';

const supabase = createClient(supabaseUrl, supabaseKey);

function App() {
  const [posts, setPosts] = useState([]);
  const [newPost, setNewPost] = useState({
    username: '',
    problem: '',
    category: 'General',
    image: null
  });
  const [newComment, setNewComment] = useState({});
  const [loading, setLoading] = useState(false);
  const [expandedComments, setExpandedComments] = useState({});
  const [recording, setRecording] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(null);
  const mediaRecorder = React.useRef(null);
  const audioChunks = React.useRef([]);

  // Fetch posts on component mount and set up auto-refresh
  useEffect(() => {
    fetchPosts();
    
    const interval = setInterval(fetchPosts, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleImageUpload = async (file, type = 'post') => {
    if (!file) return null;

    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${type}s/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Image upload error:', error);
      return null;
    }
  };

  // Voice Recording Functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      mediaRecorder.current.start();
      setRecording(true);
      
      audioChunks.current = [];
      
      mediaRecorder.current.ondataavailable = (event) => {
        audioChunks.current.push(event.data);
      };

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
        
        try {
          const fileName = `voice-${Date.now()}.wav`;
          const { error: uploadError } = await supabase.storage
            .from('audio')
            .upload(fileName, audioBlob);

          if (uploadError) {
            console.error('Audio upload error:', uploadError);
            setNewPost(prev => ({
              ...prev,
              problem: prev.problem + ' 🔊 Voice message (audio upload failed)'
            }));
            return;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('audio')
            .getPublicUrl(fileName);

          setNewPost(prev => ({
            ...prev,
            problem: prev.problem + ` 🔊 Voice message: ${publicUrl}`
          }));

        } catch (error) {
          console.error('Audio processing error:', error);
          setNewPost(prev => ({
            ...prev,
            problem: prev.problem + ' 🔊 Voice message (recording completed)'
          }));
        }
      };
    } catch (error) {
      alert('Error accessing microphone: ' + error.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && recording) {
      mediaRecorder.current.stop();
      setRecording(false);
    }
  };

  const playAudio = (audioUrl) => {
    if (playingAudio === audioUrl) {
      setPlayingAudio(null);
    } else {
      setPlayingAudio(audioUrl);
    }
  };

  // Extract audio URLs from post content
  const extractAudioUrls = (text) => {
    const audioRegex = /🔊 Voice message: (https:\/\/[^\s]+)/g;
    const matches = [];
    let match;
    while ((match = audioRegex.exec(text)) !== null) {
      matches.push(match[1]);
    }
    return matches;
  };

  // Remove audio URLs from text to display clean text
  const getCleanText = (text) => {
    return text.replace(/🔊 Voice message: https:\/\/[^\s]+/g, '').trim();
  };

  const fetchPosts = async () => {
    try {
      const { data: posts, error } = await supabase
        .from('posts')
        .select(`
          *,
          comments (*),
          likes (*),
          post_images (*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const formattedPosts = posts.map(post => ({
        id: post.id,
        username: post.username || 'Anonymous',
        problem: post.problem,
        category: post.category,
        createdAt: post.created_at,
        likes: post.likes?.length || 0,
        images: post.post_images || [],
        comments: post.comments || []
      }));
      
      setPosts(formattedPosts);
    } catch (error) {
      console.error('Error fetching posts:', error);
    }
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!newPost.problem.trim()) {
      alert('Please enter something to post!');
      return;
    }
    
    setLoading(true);
    
    try {
      const { data: postData, error } = await supabase
        .from('posts')
        .insert([
          {
            username: newPost.username || 'Anonymous',
            problem: newPost.problem,
            category: newPost.category
          }
        ])
        .select()
        .single();

      if (error) throw error;

      if (newPost.image) {
        const imageUrl = await handleImageUpload(newPost.image, 'post');
        if (imageUrl) {
          await supabase
            .from('post_images')
            .insert([{ post_id: postData.id, image_url: imageUrl }]);
        }
      }

      setNewPost({
        username: '',
        problem: '',
        category: 'General',
        image: null
      });
      
      setTimeout(fetchPosts, 1000);
    } catch (error) {
      console.error('Error creating post:', error);
      alert('Error creating post.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async (postId) => {
    if (!newComment[postId]?.trim()) return;
    
    try {
      const { error } = await supabase
        .from('comments')
        .insert([
          {
            post_id: postId,
            username: newComment[postId + '-username'] || 'Anonymous',
            comment: newComment[postId]
          }
        ]);

      if (error) throw error;
      
      setNewComment(prev => ({ 
        ...prev, 
        [postId]: '', 
        [postId + '-username']: '' 
      }));
      
      setTimeout(fetchPosts, 1000);
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  const handleLike = async (postId) => {
    try {
      const { error } = await supabase
        .from('likes')
        .insert([{ post_id: postId }]);

      if (error) throw error;
      setTimeout(fetchPosts, 1000);
    } catch (error) {
      console.error('Error liking post:', error);
    }
  };

  const toggleComments = (postId) => {
    setExpandedComments(prev => ({
      ...prev,
      [postId]: !prev[postId]
    }));
  };

  const getVisibleComments = (post) => {
    if (!post.comments) return [];
    if (expandedComments[post.id]) return post.comments;
    return post.comments.slice(0, 2);
  };

  const formatTime = (timestamp) => {
    const now = new Date();
    const postTime = new Date(timestamp);
    const diffInHours = (now - postTime) / (1000 * 60 * 60);
    
    if (diffInHours < 1) return `${Math.floor(diffInHours * 60)}m ago`;
    if (diffInHours < 24) return `${Math.floor(diffInHours)}h ago`;
    return postTime.toLocaleDateString();
  };

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <div>
            <h1>COLLEGE BROTHERHOOD</h1>
            <p>BHOPAL STUDENTS GROUP</p>
          </div>
        </div>
      </header>

      <div className="container">
        <div className="create-post-section">
          <h2>Create Post</h2>
          <form onSubmit={handleCreatePost} className="post-form">
            <input
              type="text"
              placeholder="Your Name (optional)"
              value={newPost.username}
              onChange={(e) => setNewPost({...newPost, username: e.target.value})}
            />
            <textarea
              placeholder="What's on your mind? *"
              value={newPost.problem}
              onChange={(e) => setNewPost({...newPost, problem: e.target.value})}
              required
              rows="3"
            />
            <select
              value={newPost.category}
              onChange={(e) => setNewPost({...newPost, category: e.target.value})}
            >
              <option value="General">General</option>
              <option value="Study">Study</option>
              <option value="Campus">Campus Life</option>
              <option value="Event">Events</option>
              <option value="Other">Other</option>
            </select>
            
            <div className="image-upload-section">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setNewPost({...newPost, image: e.target.files[0]})}
              />
              {newPost.image && <span>📷 {newPost.image.name}</span>}
            </div>
            
            <div className="voice-recorder">
              <button 
                type="button"
                onClick={recording ? stopRecording : startRecording}
                className={recording ? 'recording' : ''}
                disabled={loading}
              >
                {recording ? '⏹ Stop Recording' : '🎤 Record Voice Message'}
              </button>
              {recording && <span className="recording-indicator">● Recording...</span>}
            </div>
            
            <button type="submit" disabled={loading}>
              {loading ? 'Posting...' : 'Post'}
            </button>
          </form>
        </div>

        <div className="posts-feed">
          <h2>Recent Posts</h2>
          {posts.length === 0 ? (
            <p className="no-posts">No posts yet. Be the first to share!</p>
          ) : (
            posts.map(post => {
              const cleanText = getCleanText(post.problem);
              const audioUrls = extractAudioUrls(post.problem);
              
              return (
                <div key={post.id} className="post-card">
                  <div className="post-header">
                    <div className="user-info">
                      <span className="username">@{post.username}</span>
                    </div>
                    <span className="category">{post.category}</span>
                    <span className="timestamp">
                      {formatTime(post.createdAt)}
                    </span>
                  </div>
                  
                  <div className="problem-content">
                    {cleanText && <p>{cleanText}</p>}
                    
                    {/* Audio Players */}
                    {audioUrls.map((audioUrl, index) => (
                      <div key={index} className="audio-player">
                        <button 
                          onClick={() => playAudio(audioUrl)}
                          className={`audio-play-btn ${playingAudio === audioUrl ? 'playing' : ''}`}
                        >
                          {playingAudio === audioUrl ? '⏸ Pause' : '▶ Play Voice Message'}
                        </button>
                        {playingAudio === audioUrl && (
                          <audio 
                            controls 
                            autoPlay 
                            onEnded={() => setPlayingAudio(null)}
                            style={{ marginTop: '10px', width: '100%' }}
                          >
                            <source src={audioUrl} type="audio/wav" />
                            Your browser does not support the audio element.
                          </audio>
                        )}
                      </div>
                    ))}
                  </div>

                  {post.images.length > 0 && (
                    <div className="post-images">
                      {post.images.map((image, index) => (
                        <img key={index} src={image.image_url} alt="Post" className="post-image" />
                      ))}
                    </div>
                  )}
                  
                  <div className="post-actions">
                    <button 
                      onClick={() => handleLike(post.id)}
                      className="like-btn"
                    >
                      👍 {post.likes || 0}
                    </button>
                  </div>

                  <div className="comments-section">
                    <h4>Comments ({post.comments?.length || 0})</h4>
                    
                    <div className="add-comment">
                      <input
                        type="text"
                        placeholder="Your Name (optional)"
                        value={newComment[post.id + '-username'] || ''}
                        onChange={(e) => setNewComment({
                          ...newComment,
                          [post.id + '-username']: e.target.value
                        })}
                      />
                      <div className="comment-input-row">
                        <input
                          type="text"
                          placeholder="Write a comment..."
                          value={newComment[post.id] || ''}
                          onChange={(e) => setNewComment({
                            ...newComment,
                            [post.id]: e.target.value
                          })}
                          onKeyPress={(e) => e.key === 'Enter' && handleAddComment(post.id)}
                        />
                        <button onClick={() => handleAddComment(post.id)}>
                          Comment
                        </button>
                      </div>
                    </div>

                    {getVisibleComments(post).map((comment, index) => (
                      <div key={comment.id || index} className="comment">
                        <strong>@{comment.username || 'Anonymous'}:</strong>
                        <span>{comment.comment}</span>
                        <small>{formatTime(comment.created_at)}</small>
                      </div>
                    ))}
                    
                    {post.comments && post.comments.length > 2 && (
                      <button 
                        className="show-more-btn"
                        onClick={() => toggleComments(post.id)}
                      >
                        {expandedComments[post.id] ? 'Show Less' : `Show ${post.comments.length - 2} More Comments`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
