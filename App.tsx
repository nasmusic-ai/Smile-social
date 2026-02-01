
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionStatus, Message, User, Post, Notification, View, Comment, Contact, Story } from './types';
import { decode, decodeAudioData, createBlob } from './utils/audioUtils';
import Visualizer from './components/Visualizer';

const MOCK_CONTACTS: Contact[] = [
  { id: 'gemini_ai', name: 'Smile Assistant', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Smile', status: 'online' },
  { id: 'friend_1', name: 'Jordan Blue', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan', status: 'online' },
  { id: 'friend_2', name: 'Casey Sky', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Casey', status: 'offline' },
  { id: 'friend_3', name: 'Taylor Sun', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Taylor', status: 'online' },
  { id: 'friend_4', name: 'Casey Rivers', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=CaseyRivers', status: 'online' },
];

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

const GENERATE_MOCK_POSTS = (): Post[] => {
  const posts: Post[] = [];
  const authors = [
    { name: 'Smile Assistant', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Smile', id: 'gemini_ai' },
    { name: 'Global News Network', avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=News', id: 'news_bot' },
    { name: 'Tech Insider', avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=Tech', id: 'tech_bot' },
    { name: 'Jordan Blue', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan', id: 'friend_1' },
    { name: 'Casey Sky', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Casey', id: 'friend_2' },
  ];

  const newsHeadlines = [
    "New AI breakthrough promises to double battery life for smartphones.",
    "Mars Rover discovers ancient riverbed fossils, scientists say.",
    "Global markets rally as economic forecast brightens for Q4.",
    "Major breakthrough in quantum computing announced today.",
    "Local park renovation project wins international design award."
  ];

  const contentTemplates = [
    "Just enjoyed a beautiful sunset! #LifeIsGood",
    "Does anyone have a good recipe for homemade sourdough?",
    "Check out this amazing view from my morning hike!",
    "Working on a new project that I can't wait to share with you all.",
    "Finally finished reading that book everyone was talking about. 10/10 recommend."
  ];

  for (let i = 0; i < 55; i++) {
    const author = authors[i % authors.length];
    const isNews = i % 5 === 0;
    const isVideo = i % 7 === 0;
    
    posts.push({
      id: `p-${i}`,
      userId: author.id,
      userName: author.name,
      userAvatar: author.avatar,
      content: isNews ? newsHeadlines[Math.floor(i / 5) % newsHeadlines.length] : contentTemplates[i % contentTemplates.length],
      type: isNews ? 'news' : (isVideo ? 'video' : 'general'),
      image: isVideo ? undefined : `https://picsum.photos/seed/${i + 100}/800/600`,
      video: isVideo ? "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" : undefined,
      likes: [],
      comments: [
        {
          id: `c-${i}-1`,
          userId: 'friend_1',
          userName: 'Jordan Blue',
          userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan',
          text: 'Totally agree! This is awesome.',
          timestamp: new Date()
        }
      ],
      timestamp: new Date(Date.now() - i * 3600000)
    });
  }
  return posts;
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [currentView, setCurrentView] = useState<View>('feed');
  const [targetProfileId, setTargetProfileId] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImage, setNewPostImage] = useState<string | null>(null);
  const [showStoryCreate, setShowStoryCreate] = useState(false);
  const [newStoryImage, setNewStoryImage] = useState<string | null>(null);
  const [newStoryContent, setNewStoryContent] = useState('');
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [storyProgress, setStoryProgress] = useState(0);
  const [activeChatId, setActiveChatId] = useState<string>('gemini_ai');
  const [conversations, setConversations] = useState<Record<string, Message[]>>({
    'gemini_ai': [],
    'friend_1': [{ id: 'init', role: 'friend', text: 'Hey! How are things?', timestamp: new Date() }],
    'friend_2': [],
    'friend_3': [],
    'friend_4': [],
  });
  const [chatInput, setChatInput] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [isThinking, setIsThinking] = useState(false);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const storyInputRef = useRef<HTMLInputElement>(null);
  const storyTimerRef = useRef<number | null>(null);
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');

  useEffect(() => {
    const savedUser = localStorage.getItem('social_user');
    const savedPosts = localStorage.getItem('social_posts');
    const savedNotifications = localStorage.getItem('social_notifications');
    const savedConversations = localStorage.getItem('social_conversations');
    const savedStories = localStorage.getItem('social_stories');

    if (savedUser) {
        const u = JSON.parse(savedUser);
        setUser(u);
        setEditName(u.name);
        setEditBio(u.bio);
    }
    if (savedPosts) {
      setPosts(JSON.parse(savedPosts).map((p: any) => ({ ...p, timestamp: new Date(p.timestamp) })));
    } else {
      setPosts(GENERATE_MOCK_POSTS());
    }
    if (savedNotifications) {
      setNotifications(JSON.parse(savedNotifications).map((n: any) => ({ ...n, timestamp: new Date(n.timestamp) })));
    }
    if (savedStories) {
      setStories(JSON.parse(savedStories).map((s: any) => ({ ...s, timestamp: new Date(s.timestamp) })));
    } else {
        setStories([
            { id: 's1', userId: 'gemini_ai', userName: 'Assistant', userAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Smile', content: 'Spread a smile today! ✨', timestamp: new Date(), seen: false },
            { id: 's2', userId: 'friend_1', userName: 'Jordan', userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan', content: 'Coffee is life ☕', timestamp: new Date(), seen: false },
        ]);
    }
    if (savedConversations) {
      const parsed = JSON.parse(savedConversations);
      const restored: Record<string, Message[]> = {};
      Object.keys(parsed).forEach(key => {
        restored[key] = parsed[key].map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
      });
      setConversations(restored);
    }
  }, []);

  useEffect(() => {
    if (user) localStorage.setItem('social_user', JSON.stringify(user));
    localStorage.setItem('social_posts', JSON.stringify(posts));
    localStorage.setItem('social_notifications', JSON.stringify(notifications));
    localStorage.setItem('social_conversations', JSON.stringify(conversations));
    localStorage.setItem('social_stories', JSON.stringify(stories));
  }, [user, posts, notifications, conversations, stories]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, activeChatId, currentView]);

  useEffect(() => {
    if (activeStory) {
      setStoryProgress(0);
      if (storyTimerRef.current) clearInterval(storyTimerRef.current);
      storyTimerRef.current = window.setInterval(() => {
        setStoryProgress(prev => {
          if (prev >= 100) {
            setActiveStory(null);
            return 100;
          }
          return prev + 1;
        });
      }, 50);
      setStories(prev => prev.map(s => s.id === activeStory.id ? { ...s, seen: true } : s));
    } else {
      if (storyTimerRef.current) clearInterval(storyTimerRef.current);
      setStoryProgress(0);
    }
    return () => { if (storyTimerRef.current) clearInterval(storyTimerRef.current); };
  }, [activeStory]);

  const handleGoogleLogin = () => {
    setIsLoggingIn(true);
    setTimeout(() => {
      const mockUser: User = {
        id: Math.random().toString(36).substr(2, 9),
        name: 'Alex Sunshine',
        email: 'alex.sunshine@social.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
        cover: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
        bio: 'Just here to spread smiles! ☀️',
        friends: ['gemini_ai', 'friend_1'],
        pendingRequests: ['friend_4'],
        sentRequests: []
      };
      setUser(mockUser);
      setEditName(mockUser.name);
      setEditBio(mockUser.bio || '');
      setIsLoggingIn(false);
    }, 1500);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.clear();
    window.location.reload();
  };

  const handleViewProfile = (userId: string) => {
      setTargetProfileId(userId);
      setCurrentView('profile');
      setIsEditingProfile(false);
  };

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setUser({ ...user, name: editName, bio: editBio });
    setIsEditingProfile(false);
  };

  // --- Real-time Chat Support ---
  const stopSession = useCallback(() => {
    if (sessionRef.current) sessionRef.current.close?.();
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
    audioSourcesRef.current.forEach(source => source.stop());
    audioSourcesRef.current.clear();
    setStatus(ConnectionStatus.DISCONNECTED);
    setIsThinking(false);
  }, []);

  const startSession = async (initialMessage?: string) => {
    try {
      setStatus(ConnectionStatus.CONNECTING);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      if (!inputAudioContextRef.current) inputAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
      if (!outputAudioContextRef.current) outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            scriptProcessor.onaudioprocess = (e) => {
              const pcmBlob = createBlob(e.inputBuffer.getChannelData(0));
              sessionPromise.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
            if (initialMessage) sessionPromise.then((s: any) => s.send({ clientContent: { turns: [{ role: 'user', parts: [{ text: initialMessage }] }], turnComplete: true } }));
          },
          onmessage: async (m: LiveServerMessage) => {
            if (m.serverContent?.outputTranscription) { currentOutputTranscriptionRef.current += m.serverContent.outputTranscription.text; setIsThinking(true); }
            if (m.serverContent?.turnComplete) {
              const uT = currentInputTranscriptionRef.current;
              const aT = currentOutputTranscriptionRef.current;
              if (uT || aT) setConversations(prev => {
                const newM: Message[] = [];
                if (uT) newM.push({ id: Date.now().toString(), role: 'user', text: uT, timestamp: new Date() });
                if (aT) newM.push({ id: (Date.now() + 1).toString(), role: 'assistant', text: aT, timestamp: new Date() });
                return { ...prev, 'gemini_ai': [...(prev['gemini_ai'] || []), ...newM] };
              });
              currentInputTranscriptionRef.current = ''; currentOutputTranscriptionRef.current = ''; setIsThinking(false);
            }
            const audio = m.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audio) {
              const out = outputAudioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, out.currentTime);
              const buf = await decodeAudioData(decode(audio), out, 24000, 1);
              const source = out.createBufferSource();
              source.buffer = buf; source.connect(out.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buf.duration;
              audioSourcesRef.current.add(source);
            }
          },
          onerror: () => setStatus(ConnectionStatus.ERROR),
          onclose: () => setStatus(ConnectionStatus.DISCONNECTED)
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: 'You are the Smile Ai Chat Assistant. Be cheerful and friendly.',
          inputAudioTranscription: {}, outputAudioTranscription: {}
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) { setStatus(ConnectionStatus.ERROR); }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !user) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: chatInput, timestamp: new Date() };
    setConversations(prev => ({
      ...prev,
      [activeChatId]: [...(prev[activeChatId] || []), userMsg]
    }));
    
    const textToSend = chatInput;
    setChatInput('');

    if (activeChatId === 'gemini_ai') {
      if (status === ConnectionStatus.CONNECTED) {
        sessionRef.current.send({ clientContent: { turns: [{ role: 'user', parts: [{ text: textToSend }] }], turnComplete: true } });
      } else {
        startSession(textToSend);
      }
    } else {
      setTimeout(() => {
        const reply: Message = { id: (Date.now()+1).toString(), role: 'friend', text: "That sounds great! I'll catch you later! 😊", timestamp: new Date() };
        setConversations(prev => ({
          ...prev,
          [activeChatId]: [...(prev[activeChatId] || []), reply]
        }));
      }, 1000);
    }
  };

  // --- Share Logic ---
  const handleShare = async (title: string, text: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: window.location.href });
      } catch (err) { console.error('Error sharing:', err); }
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  // --- Download App Simulator ---
  const handleDownloadApp = () => {
    alert("Smile Ai is a PWA! To 'download', simply 'Add to Home Screen' from your browser's menu. 📲");
  };

  // --- Other System Logics ---
  const handleSendRequest = (targetId: string) => { if (!user) return; setUser({ ...user, sentRequests: [...user.sentRequests, targetId] }); };
  const handleAcceptRequest = (fromId: string) => { if (!user) return; setUser({ ...user, friends: [...user.friends, fromId], pendingRequests: user.pendingRequests.filter(id => id !== fromId) }); };
  const handleDeclineRequest = (fromId: string) => { if (!user) return; setUser({ ...user, pendingRequests: user.pendingRequests.filter(id => id !== fromId) }); };
  const handleCancelRequest = (targetId: string) => { if (!user) return; setUser({ ...user, sentRequests: user.sentRequests.filter(id => id !== targetId) }); };
  const handleUnfriend = (targetId: string) => { if (!user) return; setUser({ ...user, friends: user.friends.filter(id => id !== targetId) }); };
  const handleLikePost = (postId: string) => { if (!user) return; setPosts(prevPosts => prevPosts.map(post => { if (post.id === postId) { const liked = post.likes.includes(user.id); return { ...post, likes: liked ? post.likes.filter(id => id !== user.id) : [...post.likes, user.id] }; } return post; })); };
  const handleAddCommentToPost = (postId: string, text: string) => { if (!text.trim() || !user) return; setPosts(prevPosts => prevPosts.map(post => { if (post.id === postId) { return { ...post, comments: [...post.comments, { id: Date.now().toString(), userId: user.id, userName: user.name, userAvatar: user.avatar, text: text.trim(), timestamp: new Date() }] }; } return post; })); };

  const PostItem: React.FC<{ post: Post }> = ({ post }) => {
    const [showComments, setShowComments] = useState(false);
    const [commentInput, setCommentInput] = useState('');
    const submitComment = (e: React.FormEvent) => { e.preventDefault(); handleAddCommentToPost(post.id, commentInput); setCommentInput(''); };

    return (
      <div className={`bg-white rounded-2xl shadow-sm border ${post.type === 'news' ? 'border-l-4 border-l-blue-600' : 'border-gray-200'} overflow-hidden transition-all hover:border-gray-300`}>
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={post.userAvatar} className="w-10 h-10 rounded-full cursor-pointer hover:opacity-80" alt="" onClick={() => handleViewProfile(post.userId)} />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm hover:underline cursor-pointer" onClick={() => handleViewProfile(post.userId)}>{post.userName}</h3>
                  {post.type === 'news' && <span className="bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">News</span>}
                </div>
                <p className="text-[10px] text-gray-400 font-bold uppercase">{post.timestamp.toLocaleDateString()}</p>
              </div>
            </div>
          </div>
          <div className="px-4 pb-3">
            <p className={`text-gray-800 leading-relaxed whitespace-pre-wrap ${post.type === 'news' ? 'text-lg font-bold' : 'text-sm'}`}>{post.content}</p>
          </div>
          {post.image && <img src={post.image} className="w-full object-cover max-h-[500px]" alt="" />}
          <div className="px-4 py-2 border-t border-b flex items-center justify-between text-[11px] text-gray-500 font-bold uppercase">
            <div className="flex items-center gap-1"><span className="flex items-center justify-center w-5 h-5 bg-blue-500 rounded-full text-[8px] text-white"><i className="fa-solid fa-thumbs-up"></i></span> {post.likes.length} Likes</div>
            <button onClick={() => setShowComments(!showComments)} className="hover:underline">{post.comments.length} Comments</button>
          </div>
          <div className="px-2 py-1 flex gap-1">
            <button onClick={() => handleLikePost(post.id)} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm ${user && post.likes.includes(user.id) ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-100'}`}>
              <i className="fa-solid fa-thumbs-up"></i> Like
            </button>
            <button onClick={() => setShowComments(!showComments)} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm ${showComments ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-100'}`}>
              <i className="fa-solid fa-comment"></i> Comment
            </button>
            <button onClick={() => handleShare(post.userName + "'s Post", post.content)} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-gray-500 hover:bg-gray-100 font-bold text-sm">
              <i className="fa-solid fa-share"></i> Share
            </button>
          </div>
          {showComments && (
            <div className="px-4 pb-4 bg-gray-50 border-t">
              <div className="space-y-4 pt-4 max-h-60 overflow-y-auto custom-scrollbar mb-4">
                {post.comments.map(comment => (
                  <div key={comment.id} className="flex gap-2 items-start">
                    <img src={comment.userAvatar} className="w-8 h-8 rounded-full border border-gray-100" alt="" onClick={() => handleViewProfile(comment.userId)} />
                    <div className="bg-white p-3 rounded-2xl shadow-sm flex-1 border border-gray-100">
                      <h4 className="font-bold text-xs">{comment.userName}</h4>
                      <p className="text-xs text-gray-700">{comment.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={submitComment} className="flex items-center gap-2">
                <input value={commentInput} onChange={(e) => setCommentInput(e.target.value)} placeholder="Write a comment..." className="flex-1 bg-white border rounded-full px-4 py-2 text-xs outline-none" />
                <button type="submit" disabled={!commentInput.trim()} className="text-blue-600 font-bold text-xs disabled:opacity-30">Post</button>
              </form>
            </div>
          )}
        </div>
    );
  };

  const MessagingView = () => {
    const activeContact = MOCK_CONTACTS.find(c => c.id === activeChatId) || MOCK_CONTACTS[0];
    const msgs = conversations[activeChatId] || [];

    return (
      <div className="h-[calc(100vh-160px)] flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto py-6">
        <div className="w-full lg:w-80 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="text-xl font-black mb-4">Messenger</h2>
            <div className="bg-gray-100 rounded-full px-4 py-2 flex items-center gap-2">
              <i className="fa-solid fa-magnifying-glass text-gray-400 text-sm"></i>
              <input placeholder="Search" className="bg-transparent border-none text-sm outline-none w-full" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {MOCK_CONTACTS.map(c => (
              <button key={c.id} onClick={() => { setActiveChatId(c.id); if (status === ConnectionStatus.CONNECTED) stopSession(); }} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeChatId === c.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                <div className="relative">
                  <img src={c.avatar} className="w-12 h-12 rounded-full border" alt="" />
                  {c.status === 'online' && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>}
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold">{c.name}</p>
                  <p className="text-xs text-gray-400 truncate w-32">{conversations[c.id]?.slice(-1)[0]?.text || 'No messages yet'}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden relative">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={activeContact.avatar} className="w-10 h-10 rounded-full" alt="" />
              <div>
                <h3 className="font-bold text-sm">{activeContact.name}</h3>
                <p className={`text-[10px] font-black uppercase ${activeContact.status === 'online' ? 'text-green-500' : 'text-gray-400'}`}>{activeContact.status === 'online' ? 'Active Now' : 'Offline'}</p>
              </div>
            </div>
            {activeChatId === 'gemini_ai' && (
              <button onClick={() => status === ConnectionStatus.CONNECTED ? stopSession() : startSession()} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${status === ConnectionStatus.CONNECTED ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-600'}`}>
                <i className={`fa-solid ${status === ConnectionStatus.CONNECTED ? 'fa-phone-slash' : 'fa-phone'}`}></i>
              </button>
            )}
          </div>
          {activeChatId === 'gemini_ai' && status === ConnectionStatus.CONNECTED && (
             <div className="absolute inset-x-0 top-14 bottom-16 glass z-20 flex items-center justify-center">
               <Visualizer isActive={true} isThinking={isThinking} />
             </div>
          )}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {msgs.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2">
            <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Aa" className="flex-1 bg-gray-100 rounded-full px-4 py-2 outline-none text-sm" />
            <button type="submit" disabled={!chatInput.trim()} className="text-blue-600 font-bold text-sm px-2"><i className="fa-solid fa-paper-plane text-lg"></i></button>
          </form>
        </div>
      </div>
    );
  };

  const Header = () => (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-40 lg:px-6 shadow-sm">
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setCurrentView('feed'); setTargetProfileId(null); }}>
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-100">
          <i className="fa-solid fa-smile-wink text-2xl"></i>
        </div>
        <span className="font-black text-blue-600 hidden sm:block">Smile Ai</span>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={handleDownloadApp} className="hidden md:flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-xs font-black transition-all hover:bg-blue-100">
           <i className="fa-solid fa-download"></i> Download App
        </button>
        <button onClick={() => setCurrentView('messaging')} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200"><i className="fa-brands fa-facebook-messenger"></i></button>
        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => handleViewProfile(user!.id)}>
          <img src={user!.avatar} className="w-8 h-8 rounded-full border group-hover:border-blue-400" alt="" />
        </div>
        <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 transition-colors"><i className="fa-solid fa-right-from-bracket"></i></button>
      </div>
    </header>
  );

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6 text-center">
      <div className="max-w-sm w-full bg-white rounded-[2rem] shadow-2xl p-10 border animate-float">
        <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-8 shadow-xl">
          <i className="fa-solid fa-smile-wink text-4xl"></i>
        </div>
        <h1 className="text-3xl font-black text-blue-600 mb-2 tracking-tight">Smile Ai</h1>
        <p className="text-gray-500 mb-10">Experience the world's first AI-integrated social network.</p>
        <button onClick={handleGoogleLogin} disabled={isLoggingIn} className="w-full flex items-center justify-center gap-3 bg-[#1877F2] hover:bg-[#166fe5] py-4 rounded-xl font-bold text-white shadow-lg disabled:opacity-80">
          {isLoggingIn ? <i className="fa-solid fa-circle-notch animate-spin"></i> : <i className="fa-brands fa-google"></i>}
          {isLoggingIn ? 'Connecting...' : 'Continue with Google'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-100 pb-20 lg:pb-0">
      <Header />
      <div className="flex flex-1 max-w-[1920px] mx-auto w-full">
        <aside className="hidden lg:flex flex-col w-80 p-4 sticky top-14 h-[calc(100vh-56px)] space-y-2">
           <button onClick={() => { setCurrentView('feed'); setTargetProfileId(null); }} className={`w-full flex items-center gap-4 px-6 py-3 rounded-xl font-bold transition-all ${currentView === 'feed' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}><i className="fa-solid fa-house"></i> Home</button>
           <button onClick={() => setCurrentView('messaging')} className={`w-full flex items-center gap-4 px-6 py-3 rounded-xl font-bold transition-all ${currentView === 'messaging' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}><i className="fa-brands fa-facebook-messenger"></i> Messenger</button>
           <button onClick={() => { setCurrentView('friends'); setTargetProfileId(null); }} className={`w-full flex items-center gap-4 px-6 py-3 rounded-xl font-bold transition-all ${currentView === 'friends' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}><i className="fa-solid fa-users"></i> Friends</button>
        </aside>
        <main className="flex-1 p-0 lg:p-6 relative overflow-x-hidden">
          {currentView === 'feed' && (
            <div className="max-w-2xl mx-auto py-6 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex gap-4 overflow-x-auto no-scrollbar items-center">
                <div className="flex flex-col items-center gap-1.5 shrink-0 group">
                    <button onClick={() => setShowStoryCreate(true)} className="w-16 h-16 rounded-full bg-blue-600 border-4 border-white shadow-md flex items-center justify-center text-white hover:bg-blue-700 hover:scale-105 transition-all"><i className="fa-solid fa-plus text-xl"></i></button>
                    <span className="text-[11px] font-extrabold text-blue-600">You</span>
                </div>
                {stories.map(s => (
                    <div key={s.id} onClick={() => setActiveStory(s)} className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer">
                        <div className={`w-16 h-16 rounded-full p-0.5 border-2 ${s.seen ? 'border-gray-200' : 'border-transparent bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600'}`}>
                            <div className="w-full h-full rounded-full border-2 border-white overflow-hidden bg-gray-100"><img src={s.userAvatar} className="w-full h-full object-cover" alt="" /></div>
                        </div>
                        <span className={`text-[11px] font-bold truncate w-16 text-center ${s.seen ? 'text-gray-400' : 'text-gray-900'}`}>{s.userName}</span>
                    </div>
                ))}
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
                <form onSubmit={(e) => { e.preventDefault(); if (newPostContent.trim()) { setPosts([{ id: Date.now().toString(), userId: user.id, userName: user.name, userAvatar: user.avatar, content: newPostContent, likes: [], comments: [], timestamp: new Date() }, ...posts]); setNewPostContent(''); } }} className="flex gap-4">
                  <img src={user.avatar} className="w-10 h-10 rounded-full border" alt="" />
                  <textarea value={newPostContent} onChange={(e) => setNewPostContent(e.target.value)} placeholder={`What's on your mind, ${user.name.split(' ')[0]}?`} className="flex-1 bg-gray-100 rounded-2xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none min-h-[60px]" />
                  <button type="submit" disabled={!newPostContent.trim()} className="self-end bg-blue-600 text-white px-6 py-2 rounded-lg font-bold text-sm disabled:opacity-50">Post</button>
                </form>
              </div>
              {posts.map(post => <PostItem key={post.id} post={post} />)}
            </div>
          )}
          {currentView === 'messaging' && <MessagingView />}
          {currentView === 'profile' && (
            <div className="max-w-4xl mx-auto py-6">
              <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 overflow-hidden">
                <div className="h-64 relative"><img src={user.cover} className="w-full h-full object-cover" alt="" /></div>
                <div className="px-10 pb-10 relative">
                  <div className="flex flex-col lg:flex-row items-end gap-6 -mt-16 mb-8">
                    <img src={user.avatar} className="w-40 h-40 rounded-full border-4 border-white shadow-xl bg-white" alt="" />
                    <div className="flex-1 pb-4 text-center lg:text-left">
                      <h1 className="text-4xl font-black text-gray-900">{user.name}</h1>
                      <p className="text-gray-500 font-bold">{user.friends.length} Friends</p>
                    </div>
                  </div>
                  <div className="border-t pt-8"><h3 className="text-xl font-black mb-4">Your Recent Activity</h3><div className="space-y-6">{posts.filter(p => p.userId === user.id).map(p => <PostItem key={p.id} post={p} />)}</div></div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 flex items-center justify-around z-50">
        <button onClick={() => setCurrentView('feed')} className={`flex flex-col items-center justify-center flex-1 ${currentView === 'feed' ? 'text-blue-600' : 'text-gray-400'}`}><i className="fa-solid fa-house"></i><span className="text-[10px] font-bold">Home</span></button>
        <button onClick={() => setCurrentView('messaging')} className={`flex flex-col items-center justify-center flex-1 ${currentView === 'messaging' ? 'text-blue-600' : 'text-gray-400'}`}><i className="fa-brands fa-facebook-messenger"></i><span className="text-[10px] font-bold">Chats</span></button>
        <button onClick={() => setCurrentView('profile')} className={`flex flex-col items-center justify-center flex-1 ${currentView === 'profile' ? 'text-blue-600' : 'text-gray-400'}`}><i className="fa-solid fa-user"></i><span className="text-[10px] font-bold">Profile</span></button>
      </nav>
      {activeStory && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center" onClick={() => setActiveStory(null)}>
              <div className="absolute top-0 left-0 right-0 h-1 bg-white/20 z-20"><div className="h-full bg-white transition-all duration-75 linear" style={{ width: `${storyProgress}%` }}></div></div>
              <div className="absolute top-4 left-0 right-0 px-4 flex items-center justify-between z-10" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-3">
                      <img src={activeStory.userAvatar} className="w-10 h-10 rounded-full border-2 border-white shadow-md" alt="" />
                      <div className="text-white drop-shadow-md"><p className="font-bold text-sm">{activeStory.userName}</p></div>
                  </div>
                  <button onClick={() => setActiveStory(null)} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center backdrop-blur-md"><i className="fa-solid fa-xmark"></i></button>
              </div>
              <div className="relative w-full max-w-sm h-[80vh] flex items-center justify-center overflow-hidden rounded-[2.5rem] shadow-2xl bg-gradient-to-br from-gray-900 to-black" onClick={e => e.stopPropagation()}>
                  {activeStory.image ? <img src={activeStory.image} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center p-12 text-center text-white italic text-3xl font-black">{activeStory.content}</div>}
              </div>
              <div className="mt-8 flex gap-4 p-2 bg-white/10 backdrop-blur-xl rounded-full border border-white/20" onClick={e => e.stopPropagation()}>
                  {REACTION_EMOJIS.map(emoji => (
                    <button key={emoji} onClick={() => handleShare(activeStory.userName + "'s Story", emoji)} className="text-2xl hover:scale-125 transition-transform p-2">{emoji}</button>
                  ))}
                  <button onClick={() => handleShare(activeStory.userName + "'s Story", activeStory.content || "Check out this story!")} className="text-white text-lg p-2"><i className="fa-solid fa-share"></i></button>
              </div>
          </div>
      )}
      {showStoryCreate && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl">
                  <div className="p-6 border-b flex items-center justify-between"><h2 className="text-xl font-black">Create Story</h2><button onClick={() => setShowStoryCreate(false)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"><i className="fa-solid fa-xmark"></i></button></div>
                  <div className="p-6 space-y-6">
                      <div className="relative h-64 bg-gray-50 rounded-2xl flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-200 cursor-pointer" onClick={() => storyInputRef.current?.click()}>
                          <input type="file" ref={storyInputRef} className="hidden" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onloadend = () => setNewStoryImage(r.result as string); r.readAsDataURL(f); } }} />
                          {newStoryImage ? <img src={newStoryImage} className="w-full h-full object-cover" alt="" /> : <p className="text-sm font-bold text-gray-400">Click to Upload Photo</p>}
                      </div>
                      <input value={newStoryContent} onChange={(e) => setNewStoryContent(e.target.value)} placeholder="What's the vibe?" className="w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm outline-none" />
                      <button onClick={() => { setStories([{ id: Date.now().toString(), userId: user.id, userName: 'You', userAvatar: user.avatar, image: newStoryImage || undefined, content: newStoryContent || undefined, timestamp: new Date(), seen: true }, ...stories]); setNewStoryImage(null); setNewStoryContent(''); setShowStoryCreate(false); }} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold">Share to Story</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
