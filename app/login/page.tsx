'use client';
/* eslint-disable @next/next/no-location-assign-relative-destination -- Account changes must discard the previous account's client/router memory. */
import {useState} from 'react';
import {clearOfflineWorkspace,offlineReviews} from '@/lib/offlineStudy';
export default function Login(){
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <main className="mx-auto flex min-h-full max-w-sm items-center px-6 py-12"><form className="w-full space-y-5" onSubmit={async event=>{
    event.preventDefault();setBusy(true);setError('');const values=new FormData(event.currentTarget);
    try{
      const name=String(values.get('name')??'').trim().toLowerCase();
      const sameAccount=localStorage.getItem('morrow:account')===name;
      if((await offlineReviews()).length&&!sameAccount)throw Error('Pending answers are still saved on this device. Sign back into the same account to synchronize them before changing accounts.');
      const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:values.get('name'),password:values.get('password')})});
      const result=await response.json();if(!response.ok)throw Error(result.error??'Sign-in failed');
      // Start with this account's server inventory, never another account's
      // remembered queues, pages or optimistic review state.
      if(!sameAccount)await clearOfflineWorkspace();
      localStorage.setItem('morrow:account',name);
      window.location.assign('/');
    }catch(reason){setError(reason instanceof Error?reason.message:'Connection failed');setBusy(false);}
  }}>
    <div><h1 className="font-display text-3xl text-accent-200">Morrow</h1><p className="mt-2 text-sm text-[#aaa596]">Sign in to your learning workspace.</p></div>
    <label className="block text-sm">Account<input name="name" autoComplete="username" required className="mt-2 w-full border border-[#423e42] bg-[#28262a] p-3"/></label>
    <label className="block text-sm">Password<input name="password" type="password" autoComplete="current-password" required className="mt-2 w-full border border-[#423e42] bg-[#28262a] p-3"/></label>
    {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
    <button disabled={busy} className="w-full bg-accent-300 p-3 text-[#1c140d] disabled:opacity-50">{busy?'Signing in…':'Sign in'}</button>
  </form></main>;
}
