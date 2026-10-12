import type {MetadataRoute} from 'next';

export default function manifest():MetadataRoute.Manifest{
  return {
    id:'/',name:'Morrow',short_name:'Morrow',description:'Understand your courses and review them with spaced repetition.',
    start_url:'/study',scope:'/',display:'standalone',background_color:'#1a1a1b',theme_color:'#201f21',
    icons:[{src:'/icons/morrow-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
      {src:'/icons/morrow-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}],
    shortcuts:[{name:'Study',url:'/study'},{name:'Learning map',url:'/'}],
  };
}
