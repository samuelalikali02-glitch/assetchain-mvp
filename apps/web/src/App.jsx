import React,{useEffect,useState} from "react";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);


const API = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api").replace(/\/+$/, "");
async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();

  return fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {})
    }
  });
}
const profiles={
  Agriculture:[["Temperature","deg C",24,39],["Vibration","mm/s",1,5],["Operating hours","hrs",100,800],["Humidity","%",35,80]],
  Vehicle:[["Engine temperature","deg C",70,110],["Mileage","km",12000,180000],["Battery voltage","V",11,14],["GPS signal","%",85,100]],
  "Real estate":[["Indoor temperature","deg C",22,34],["Humidity","%",35,80],["Water leakage","status",0,1],["Structural tilt"," ",0,3]]
};
const categories=["Agriculture","Vehicle","Real estate"];

const money=n=>Number(n).toLocaleString();

function PasswordInput({
 label,
 value,
 onChange,
 placeholder,
 autoComplete="current-password",
 minLength,
 required=true,
 disabled=false
}) {
 const [visible,setVisible]=useState(false);

 return (
  <label className="password-field">
   {label}
   <span className="password-input-wrap">
    <input
     type={visible ? "text" : "password"}
     value={value}
     onChange={onChange}
     placeholder={placeholder}
     autoComplete={autoComplete}
     minLength={minLength}
     required={required}
     disabled={disabled}
    />
    <button
     type="button"
     className="password-visibility"
     onClick={()=>setVisible(current=>!current)}
     aria-label={visible ? "Hide password" : "Show password"}
     aria-pressed={visible}
    >
     {visible ? "Hide" : "Show"}
    </button>
   </span>
  </label>
 );
}

function App(){

 const [assets,setAssets]=useState([]);
 const [selected,setSelected]=useState(null);
 const [page,setPage]=useState("Overview");
 const [form,setForm]=useState({name:"",category:"Agriculture",location:"",description:"",organisationId:""});
 const [files,setFiles]=useState([]);
 const [readings,setReadings]=useState([]);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [verify,setVerify]=useState("");
 const [verified,setVerified]=useState(null);
 const [blockchainEvents,setBlockchainEvents]=useState([]);
 const [orgSession,setOrgSession]=useState(null);
 const [orgEmail,setOrgEmail]=useState("");
 const [orgPassword,setOrgPassword]=useState("");
 const [authMode,setAuthMode]=useState("login");
 const [authName,setAuthName]=useState("");
 const [accountType,setAccountType]=useState("personal");
 const [recoveryMode,setRecoveryMode]=useState(false);
 const [newPassword,setNewPassword]=useState("");
 const [confirmPassword,setConfirmPassword]=useState("");
 const [orgBusy,setOrgBusy]=useState(false);
 const [orgs,setOrgs]=useState([]);
 const [profileForm,setProfileForm]=useState({
  full_name:"",username:"",phone:"",location:"",bio:"",website:""
 });
 const [profilePrefs,setProfilePrefs]=useState({
  email_updates:true,security_alerts:true,product_updates:false
 });
 const [profilePassword,setProfilePassword]=useState("");
 const [profilePasswordConfirm,setProfilePasswordConfirm]=useState("");
 const [profileBusy,setProfileBusy]=useState(false);
 const [orgForm,setOrgForm]=useState({
  legal_name:"",display_name:"",organisation_type:"Company",country:"Nigeria",
  registration_number:"",address:"",website:"",contact_email:"",phone:""
 });
 const [marketplaceListings,setMarketplaceListings]=useState([]);
 const [marketplaceBusy,setMarketplaceBusy]=useState(false);
 const [listingForm,setListingForm]=useState({
  assetId:"",organisationId:"",listingType:"full_sale",
  askingPrice:"",currency:"NGN",ownershipPercentage:"100"
 });
 const [offerAmounts,setOfferAmounts]=useState({});
 const [platformUser,setPlatformUser]=useState(null);
 const [platformOverview,setPlatformOverview]=useState(null);
 const [platformOrgs,setPlatformOrgs]=useState([]);
 const [inspectorForm,setInspectorForm]=useState({
  full_name:"",email:"",phone:"",qualifications:"",
  experience:"",specialisation:"",coverage_area:""
 });
 const [inspectorApplication,setInspectorApplication]=useState(null);
 const [inspectorApplications,setInspectorApplications]=useState([]);
 const [inspectorBusy,setInspectorBusy]=useState(false);
 const [inspectorConsent,setInspectorConsent]=useState(false);


 useEffect(()=>{
  if(!selected?.passportId){
   setBlockchainEvents([]);
   return;
  }

  let active=true;

  async function loadBlockchainEvents(){
   try{
    const response=await apiFetch(
     `${API}/blockchain-events?passportId=${encodeURIComponent(selected.passportId)}`
    );
    if(response.ok){
     const events=await response.json();
     if(active)setBlockchainEvents(Array.isArray(events)?events:[]);
    }
   }catch(err){
    console.error("Blockchain event loading failed:",err);
   }
  }

  loadBlockchainEvents();
  const timer=setInterval(loadBlockchainEvents,5000);

  return ()=>{
   active=false;
   clearInterval(timer);
  };
 },[selected?.passportId]);
 async function load(){
  try{const r=await apiFetch(API+"/assets");if(r.ok)setAssets(await r.json())}catch{}
 }
 useEffect(()=>{load();const t=setInterval(load,3000);return()=>clearInterval(t)},[]);
 useEffect(()=>{
  if(!selected)return;
  const profile=profiles[selected.category]||profiles.Agriculture;
  const generate=()=>setReadings(profile.map(([name,unit,min,max])=>({
   name,unit,value:unit==="status"?(Math.random()>.92?1:0):Number((min+Math.random()*(max-min)).toFixed(1))
  })));
  generate();const t=setInterval(generate,2500);return()=>clearInterval(t);
 },[selected?.id]);

 async function register(e){
  e.preventDefault();setBusy(true);setNotice("");
  try{
   const docs=await Promise.all(files.map(async f=>({name:f.name,size:f.size,type:f.type,hash:await crypto.subtle.digest("SHA-256",await f.arrayBuffer()).then(b=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join(""))})));
   const r=await apiFetch(API+"/assets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,documents:docs})});
   const data=await r.json();if(!r.ok)throw Error(data.error);
   await load();setSelected(data);setPage("Asset passport");setForm({name:"",category:"Agriculture",location:"",description:"",organisationId:""});setFiles([]);
   setNotice("Asset passport created successfully.");
  }catch(err){setNotice("Could not register asset: "+err.message)}
  setBusy(false);
 }
 async function loadMyInspectorApplication(){
  const r=await apiFetch(API+"/inspector-applications");
  const d=await r.json();
  if(!r.ok)throw Error(d.error||"Could not load application status");
  setInspectorApplication(d.application||null);
 }

 async function loadInspectorApplications(){
  const r=await apiFetch(API+"/platform/inspector-applications");
  const d=await r.json();
  if(!r.ok)throw Error(d.error||"Could not load inspector applications");
  setInspectorApplications(d.applications||[]);
 }

 async function submitInspectorApplication(e){
  e.preventDefault();
  if(!inspectorConsent){
   setNotice("Please confirm the applicant declaration before submitting.");
   return;
  }
  setInspectorBusy(true);
  setNotice("");
  try{
   const r=await apiFetch(API+"/inspector-applications",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(inspectorForm)
   });
   const d=await r.json();
   if(!r.ok)throw Error(d.error||"Could not submit application");
   setInspectorApplication(d.application||null);
   setNotice("Inspector application submitted for platform review.");
  }catch(e){
   setNotice("Application submission failed: "+e.message);
  }finally{
   setInspectorBusy(false);
  }
 }

 async function reviewInspectorApplication(id,status){
  const prompts={
   approved:"Appoint this applicant as a platform inspector?",
   rejected:"Reject this inspector application?",
   needs_information:"Request more information from this applicant?"
  };
  if(!window.confirm(prompts[status]))return;
  setInspectorBusy(true);
  try{
   const r=await apiFetch(API+`/platform/inspector-applications/${id}`,{
    method:"PATCH",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     status,
     review_notes:status==="needs_information"?"Please provide further information for review.":""
    })
   });
   const d=await r.json();
   if(!r.ok)throw Error(d.error||"Could not update application");
   await loadInspectorApplications();
   setNotice(status==="approved"?"Inspector appointed successfully.":"Application review updated.");
  }catch(e){
   setNotice("Review failed: "+e.message);
  }finally{
   setInspectorBusy(false);
  }
 }

 useEffect(()=>{
  if(page==="Become an Inspector"&&orgSession?.access_token){
   setInspectorForm(f=>({
    ...f,
    email:f.email||orgSession.user?.email||"",
    full_name:f.full_name||orgSession.user?.user_metadata?.full_name||""
   }));
   loadMyInspectorApplication().catch(e=>setNotice(e.message));
  }
 },[page,orgSession?.access_token]);

 useEffect(()=>{
  if(page==="Platform administration"&&["platform_owner","platform_admin"].includes(platformUser?.platformRole)){
   loadInspectorApplications().catch(e=>setNotice(e.message));
  }
 },[page,platformUser?.platformRole]);

 async function loadMarketplace(){
  const r=await apiFetch(API+"/marketplace/listings");
  const data=await r.json();
  if(!r.ok)throw Error(data.error||"Could not load marketplace listings");
  setMarketplaceListings(Array.isArray(data)?data:[]);
 }

 async function publishListing(e){
  e.preventDefault();
  setMarketplaceBusy(true);
  setNotice("");
  try{
   const r=await apiFetch(API+"/marketplace/listings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(listingForm)
   });
   const data=await r.json();
   if(!r.ok)throw Error(data.error||"Could not publish listing");
   await loadMarketplace();
   setListingForm({
    assetId:"",organisationId:"",listingType:"full_sale",
    askingPrice:"",currency:"NGN",ownershipPercentage:"100"
   });
   setNotice("Listing published. Legal review has not been completed.");
  }catch(err){
   setNotice("Could not publish listing: "+err.message);
  }finally{
   setMarketplaceBusy(false);
  }
 }

 async function submitOffer(listingId){
  const amount=offerAmounts[listingId];
  if(!amount||!Number.isFinite(Number(amount))||Number(amount)<=0){
   setNotice("Enter a valid offer amount.");
   return;
  }
  setMarketplaceBusy(true);
  setNotice("");
  try{
   const r=await apiFetch(API+"/marketplace/offers",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     listingId,
     offerAmount:Number(amount),
     offeredPercentage:100
    })
   });
   const data=await r.json();
   if(!r.ok)throw Error(data.error||"Could not submit offer");
   setOfferAmounts(prev=>({...prev,[listingId]:""}));
   setNotice("Offer submitted. No payment has been made.");
  }catch(err){
   setNotice("Offer submission failed: "+err.message);
  }finally{
   setMarketplaceBusy(false);
  }
 }

 async function assign(){
  setBusy(true);
  setNotice("");
  try {
   const r=await apiFetch(`${API}/assets/${selected.id}/assign`,{method:"POST"});
   const a=await r.json();
   if(!r.ok) throw Error(a.error || "Inspector assignment failed");
   setSelected(a);
   await load();
   setNotice(`Demonstration inspector assigned: ${a.inspector?.name || "Demo Field Inspector"}.`);
  } catch(err) {
   setNotice("Inspector assignment failed: " + err.message);
  } finally {
   setBusy(false);
  }
 }
 async function inspect(){
  setBusy(true);
  setNotice("");

  try {
   const categoryChecks = {
    Agriculture: [
     "Equipment identity and serial number",
     "Visible mechanical condition",
     "Engine and operating-hour records",
     "Vibration and temperature observations",
     "Humidity and storage conditions",
     "Supporting documents"
    ],
    Vehicle: [
     "Vehicle identification number (VIN)",
     "Exterior and interior condition",
     "Engine temperature observations",
     "Mileage and service history",
     "Battery voltage observations",
     "Supporting documents"
    ],
    "Real estate": [
     "Property identity and location",
     "Visible structural condition",
     "Indoor temperature and humidity",
     "Water leakage observations",
     "Structural tilt observations",
     "Supporting documents"
    ]
   };

   const checks = categoryChecks[selected.category] || categoryChecks.Agriculture;

   const findings = [
    ...checks.map(check => ({
     check,
     result: check === "Supporting documents"
      ? (selected.documents.length
        ? `${selected.documents.length} document(s) fingerprinted`
        : "No documents uploaded")
      : "Requires independent physical inspector confirmation"
    })),
    {
     check: "Sensor data snapshot",
     result: `${readings.length} simulated readings recorded`
    }
   ];

   const r = await apiFetch(`${API}/assets/${selected.id}/inspect`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
     findings,
     readings,
     notes: `Category-specific ${selected.category} demonstration inspection. Sensor values are simulated. Physical inspection and findings have not been independently confirmed.`
    })
   });

   const a = await r.json();
   if (!r.ok) throw Error(a.error || "Inspection failed");

   setSelected(a);
   await load();
   setNotice("Category-specific inspection report generated successfully.");
  } catch(err) {
   setNotice("Inspection failed: " + err.message);
  } finally {
   setBusy(false);
  }
 }
 async function verifyPassport(e){
  e.preventDefault();
  if(!verify.trim()){
   setVerified(false);
   setNotice("Enter a passport ID to begin verification.");
   return;
  }
  const a=assets.find(x=>x.passportId.toLowerCase()===verify.trim().toLowerCase());
  setVerified(a||false);
  if(a){
   setNotice(`Passport found: ${a.name} (${a.passportId}). Review its displayed evidence and verification status.`);
  } else {
   setNotice(`No passport found for "${verify.trim()}". Check the ID and try again.`);
  }
 }
 useEffect(()=>{
  supabase.auth.getSession().then(({data})=>setOrgSession(data.session));
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
   setOrgSession(session);
   if(event === "PASSWORD_RECOVERY"){
     setRecoveryMode(true);
     setNotice("Choose a new password for your AssetChain account.");
   }
  });
  return ()=>subscription.unsubscribe();
 },[]);

  useEffect(()=>{
  if(!orgSession?.access_token){setPlatformUser(null);return;}
  let active=true;
  apiFetch(API+"/me").then(r=>r.ok?r.json():null).then(d=>{
   if(active)setPlatformUser(d?.user||null);
  }).catch(()=>{if(active)setPlatformUser(null);});
  return ()=>{active=false;};
 },[orgSession?.access_token]);

 async function loadPlatformOverview(){
  const [a,b]=await Promise.all([
   apiFetch(API+"/platform/overview"),
   apiFetch(API+"/platform/organisations")
  ]);
  const overview=await a.json();
  const organisations=await b.json();
  if(!a.ok)throw Error(overview.error||"Overview unavailable");
  if(!b.ok)throw Error(organisations.error||"Organisation list unavailable");
  setPlatformOverview(overview);
  setPlatformOrgs(Array.isArray(organisations)?organisations:organisations.organisations||[]);
 }
 useEffect(()=>{
  if(page==="Platform administration"&&["platform_owner","platform_admin"].includes(platformUser?.platformRole)){
   loadPlatformOverview().catch(e=>setNotice(e.message));
  }
 },[page,platformUser?.platformRole]);
async function loadOrganisations(token){
  if(!token)return;
  try{
   const response=await apiFetch(API+"/organisations",{
    headers:{Authorization:"Bearer "+token}
   });
   const data=await response.json();
   if(!response.ok)throw Error(data.error||"Could not load organisations");
   setOrgs(data.organisations||[]);
  }catch(error){
   setNotice("Organisation loading failed: "+error.message);
  }
 }

 useEffect(()=>{
  const metadata=orgSession?.user?.user_metadata||{};
  setProfileForm({
   full_name:metadata.full_name||"",
   username:metadata.username||"",
   phone:metadata.phone||"",
   location:metadata.location||"",
   bio:metadata.bio||"",
   website:metadata.website||""
  });
  setProfilePrefs({
   email_updates:metadata.notification_preferences?.email_updates??true,
   security_alerts:metadata.notification_preferences?.security_alerts??true,
   product_updates:metadata.notification_preferences?.product_updates??false
  });
 },[orgSession?.user?.id]);
 useEffect(()=>{
  if(orgSession?.access_token)loadOrganisations(orgSession.access_token);
  else setOrgs([]);
 },[orgSession?.access_token]);
 useEffect(()=>{
  if(page==="Marketplace"){
   loadMarketplace().catch(error=>{
    setNotice("Marketplace loading failed: "+error.message);
   });
  }
 },[page]);


  async function saveNewPassword(e){
   e.preventDefault();
   setNotice("");

   if(newPassword.length < 8){
     setNotice("Your new password must contain at least 8 characters.");
     return;
   }

   if(newPassword !== confirmPassword){
     setNotice("The passwords do not match.");
     return;
   }

   setOrgBusy(true);

   try {
     const {error}=await supabase.auth.updateUser({password:newPassword});
     if(error) throw error;

     setRecoveryMode(false);
     setNewPassword("");
     setConfirmPassword("");
     setOrgPassword("");
     setAuthMode("login");
     setNotice("Your password has been changed successfully.");
   } catch(error) {
     setNotice(error.message || "Could not update your password. Request a new recovery email.");
   } finally {
     setOrgBusy(false);
   }
 }
async function submitAuth(e){
   e.preventDefault();
   setOrgBusy(true);
   setNotice("");

   try {
     const email = orgEmail.trim();

     if (!email) {
       throw new Error("Enter your email address.");
     }

     if (authMode === "signup") {
       if (!authName.trim()) {
         throw new Error("Enter your full name.");
       }

       if (orgPassword.length < 8) {
         throw new Error("Password must contain at least 8 characters.");
       }

       const {data,error}=await supabase.auth.signUp({
         email,
         password:orgPassword,
         options:{
           data:{
             full_name:authName.trim(),
             account_type:accountType
           }
         }
       });

       if(error) throw error;

       if(data.session){
         setOrgSession(data.session);
         setOrgPassword("");

         if(accountType === "organisation"){
           setPage("Organisation");
           setNotice("Your account has been created. Continue by setting up your organisation.");
         } else {
           setPage("Overview");
           setNotice("Your personal account has been created successfully.");
         }
       } else {
         setOrgPassword("");
         setNotice("Account created. Check your email to confirm your account, then sign in.");
         setAuthMode("login");
       }
     } else {
       const {data,error}=await supabase.auth.signInWithPassword({
         email,
         password:orgPassword
       });

       if(error) throw error;

       setOrgSession(data.session);
       setOrgPassword("");

       const savedAccountType = data.user?.user_metadata?.account_type;

       if(savedAccountType === "organisation"){
         setPage("Organisation");
       } else {
         setPage("Overview");
       }

       setNotice("Welcome back.");
     }
   } catch(error) {
     setNotice(error.message || "Authentication failed.");
   } finally {
     setOrgBusy(false);
   }
 }
async function recoverPassword(){
   setNotice("");

   if(!orgEmail.trim()){
     setNotice("Enter your email address first.");
     return;
   }

   setOrgBusy(true);

   try {
     const {error}=await supabase.auth.resetPasswordForEmail(
       orgEmail.trim(),
       {redirectTo:`${window.location.origin}/reset-password`}
     );

     if(error) throw error;

     setNotice("If an account exists for this email, a recovery link has been sent. Check your inbox and spam folder.");
   } catch(error) {
     setNotice(error.message || "Could not send recovery email.");
   } finally {
     setOrgBusy(false);
   }
 }
 async function organisationLogin(e){
  e.preventDefault();
  setOrgBusy(true);
  setNotice("");
  try{
   const {data,error}=await supabase.auth.signInWithPassword({
    email:orgEmail.trim(),password:orgPassword
   });
   if(error)throw error;
   setOrgSession(data.session);
   setOrgPassword("");
   setNotice("Organisation account signed in successfully.");
  }catch(error){
   setNotice("Sign-in failed: "+error.message);
  }finally{
   setOrgBusy(false);
  }
 }

 async function createOrganisation(e){
  e.preventDefault();
  if(!orgSession?.access_token)return;
  setOrgBusy(true);
  setNotice("");
  try{
   const response=await apiFetch(API+"/organisations",{
    method:"POST",
    headers:{
     "Content-Type":"application/json",
     Authorization:"Bearer "+orgSession.access_token
    },
    body:JSON.stringify(orgForm)
   });
   const data=await response.json();
   if(!response.ok)throw Error(data.detail||data.error||"Organisation creation failed");
   setNotice("Organisation created. Your account is its organisation owner.");
   setOrgForm({
    legal_name:"",display_name:"",organisation_type:"Company",country:"Nigeria",
    registration_number:"",address:"",website:"",contact_email:"",phone:""
   });
   await loadOrganisations(orgSession.access_token);
  }catch(error){
   setNotice("Could not create organisation: "+error.message);
  }finally{
   setOrgBusy(false);
  }
 }

 async function saveProfile(e){
  e.preventDefault();
  if(!orgSession?.user)return;
  setProfileBusy(true);
  try{
   const {data,error}=await supabase.auth.updateUser({
    data:{
     full_name:profileForm.full_name.trim(),
     username:profileForm.username.trim(),
     phone:profileForm.phone.trim(),
     location:profileForm.location.trim(),
     bio:profileForm.bio.trim(),
     website:profileForm.website.trim(),
     notification_preferences:profilePrefs
    }
   });
   if(error)throw error;
   if(data.user)setOrgSession(current=>current?{...current,user:data.user}:current);
   setNotice("Your profile has been updated.");
  }catch(error){
   setNotice("Profile update failed: "+error.message);
  }finally{
   setProfileBusy(false);
  }
 }

 async function changeProfilePassword(e){
  e.preventDefault();
  if(profilePassword.length<8){
   setNotice("Your new password must contain at least 8 characters.");
   return;
  }
  if(profilePassword!==profilePasswordConfirm){
   setNotice("The password confirmation does not match.");
   return;
  }
  setProfileBusy(true);
  try{
   const {error}=await supabase.auth.updateUser({password:profilePassword});
   if(error)throw error;
   setProfilePassword("");
   setProfilePasswordConfirm("");
   setNotice("Your password has been changed.");
  }catch(error){
   setNotice("Password update failed: "+error.message);
  }finally{
   setProfileBusy(false);
  }
 }
 async function organisationLogout(){
  await supabase.auth.signOut();
  setOrgSession(null);
  setOrgs([]);
  setNotice("Organisation account signed out.");
 }
  if(recoveryMode){
   return (
     <div className="shell">
       <main className="main" style={{maxWidth:"520px",width:"100%",margin:"auto"}}>
         <section className="panel" style={{marginTop:"10vh",padding:"28px"}}>
           <p className="eyebrow">ASSETCHAIN   ACCOUNT RECOVERY</p>
           <h1>Reset your password</h1>
           <p className="muted">Choose a new password for your account.</p>
           <form className="form" onSubmit={saveNewPassword}>
            <PasswordInput
 label="New password"
 value={profilePassword}
 onChange={e=>setProfilePassword(e.target.value)}
 minLength={8}
 autoComplete="new-password"
 placeholder="At least 8 characters"
/>
            <PasswordInput
 label="Confirm new password"
 value={profilePasswordConfirm}
 onChange={e=>setProfilePasswordConfirm(e.target.value)}
 minLength={8}
 autoComplete="new-password"
 placeholder="Enter the password again"
/>
             <button type="submit" disabled={orgBusy}>
               {orgBusy ? "Saving..." : "Save new password"}
             </button>
           </form>
           {notice && <p role="status" style={{marginTop:"16px"}}>{notice}</p>}
         </section>
       </main>
     </div>
   );
 }
if(!orgSession){
   return (
     <div className="ac-auth-shell">
       <main className="ac-auth-layout">
         <section className="ac-auth-intro">
           <div className="ac-auth-brand">
             <span className="ac-auth-mark">A</span>
             <span>AssetChain</span>
           </div>

           <div className="ac-auth-intro-content">
             <p className="ac-auth-kicker">ASSET MANAGEMENT. BUILT ON TRUST.</p>
             <h1>Know your assets. Verify their history.</h1>
             <p>
               A secure workspace for recording, tracking and verifying
               asset information with confidence.
             </p>
           </div>

           <div className="ac-auth-intro-footer">
             Secure access to your asset records and organisation workspace.
           </div>
         </section>

         <section className="ac-auth-panel">
           <div className="ac-auth-form-wrap">
             <p className="ac-auth-eyebrow">ASSETCHAIN SECURE ACCESS</p>

             <div className="ac-auth-heading">
               <h2>{authMode==="signup" ? "Create your account" : "Welcome back"}</h2>
               <p>
                 {authMode==="signup"
                   ? "Choose the account that best describes how you will use AssetChain."
                   : "Sign in to continue to your AssetChain workspace."}
               </p>
             </div>

             <div className="ac-auth-tabs" role="group" aria-label="Authentication mode">
               <button
                 type="button"
                 className={authMode==="login" ? "active" : ""}
                 onClick={()=>setAuthMode("login")}
                 aria-pressed={authMode==="login"}
               >
                 Sign in
               </button>
               <button
                 type="button"
                 className={authMode==="signup" ? "active" : ""}
                 onClick={()=>setAuthMode("signup")}
                 aria-pressed={authMode==="signup"}
               >
                 Create account
               </button>
             </div>

             {authMode==="signup" && (
               <div className="ac-account-choice">
                 <p className="ac-auth-label">Choose account type</p>

                 <div className="ac-account-grid">
                   <button
                     type="button"
                     className={`ac-account-option ${accountType==="personal" ? "selected" : ""}`}
                     onClick={()=>setAccountType("personal")}
                     aria-pressed={accountType==="personal"}
                   >
                     <span className="ac-account-icon" aria-hidden="true">â—Ž</span>
                     <strong>Personal account</strong>
                     <span>Manage and track your personal asset records.</span>
                     <span className="ac-account-selected">
                       {accountType==="personal" ? "Selected" : "Choose personal"}
                     </span>
                   </button>

                   <button
                     type="button"
                     className={`ac-account-option ${accountType==="organisation" ? "selected" : ""}`}
                     onClick={()=>setAccountType("organisation")}
                     aria-pressed={accountType==="organisation"}
                   >
                     <span className="ac-account-icon" aria-hidden="true">â–¦</span>
                     <strong>Organisation account</strong>
                     <span>Create an account to set up or join an organisation workspace.</span>
                     <span className="ac-account-selected">
                       {accountType==="organisation" ? "Selected" : "Choose organisation"}
                     </span>
                   </button>
                 </div>

                 {accountType==="organisation" && (
                   <p className="ac-account-note">
                     First, create your secure login. You can then set up your
                     organisation through the organisation workspace.
                   </p>
                 )}
               </div>
             )}

             <form className="form ac-auth-form" onSubmit={submitAuth}>
               {authMode==="signup" && (
                 <label>
                   Full name
                   <input
                     required
                     value={authName}
                     onChange={e=>setAuthName(e.target.value)}
                     placeholder="Enter your full name"
                     autoComplete="name"
                   />
                 </label>
               )}

               <label>
                 Email address
                 <input
                   type="email"
                   required
                   value={orgEmail}
                   onChange={e=>setOrgEmail(e.target.value)}
                   placeholder="you@example.com"
                   autoComplete="email"
                 />
               </label>

               <PasswordInput
                 label="Password"
                 value={orgPassword}
                 onChange={e=>setOrgPassword(e.target.value)}
                 minLength={authMode==="signup" ? 8 : undefined}
                 placeholder={authMode==="signup" ? "At least 8 characters" : "Your password"}
                 autoComplete={authMode==="signup" ? "new-password" : "current-password"}
               />

               {authMode==="login" && (
                 <div className="ac-auth-forgot">
                   <button
                     type="button"
                     onClick={recoverPassword}
                     disabled={orgBusy}
                   >
                     Forgot password?
                   </button>
                 </div>
               )}

               <button className="ac-auth-submit" type="submit" disabled={orgBusy}>
                 {orgBusy
                   ? "Please wait..."
                   : authMode==="signup"
                     ? "Create account"
                     : "Sign in"}
               </button>
             </form>

             {notice && (
               <p className="ac-auth-notice" role="status" aria-live="polite">
                 {notice}
               </p>
             )}

             <p className="ac-auth-security">
               Keep your login credentials private. Only provide information
               necessary for your asset records.
             </p>
           </div>
         </section>
       </main>
     </div>
   );
 } const card=(label,value,sub)=><div className="stat"><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>;
 return <div className="shell">
  <aside className="sidebar">
   <div className="brand"><div className="brandmark">A</div><div>AssetChain<small>TRUST INFRASTRUCTURE</small></div></div>
   <div className="navlabel">WORKSPACE</div>
   {["Overview","Asset register","Inspection centre","Verify passport","Organisation","Profile","Become an Inspector","Marketplace",...(["platform_owner","platform_admin"].includes(platformUser?.platformRole)?["Platform administration"]:[])].map(p=><button className={page===p?"nav active":"nav"} onClick={()=>setPage(p)} key={p}><span>{({Overview:" ","Asset register":" ","Inspection centre":" ","Verify passport":" ",Organisation:" "})[p]}</span>{p}</button>)}
   <div className="sidebottom"><div className="live-dot"></div> API-connected demo <small>Hackathon prototype   Nigeria</small></div>
  </aside>
  <main className="main">
   <header><div><span className="eyebrow">REAL-WORLD ASSET PASSPORTS</span><h1>{page}</h1></div><div className="header-right"><span className="status-pill">  DEMO ENVIRONMENT</span><div className="avatar">AC</div></div></header>
   {notice&&<div className={`notice ${/failed|could not|not found|no matching|already anchored|enter a passport/i.test(notice)?"notice-error":"notice-success"}`} role={/failed|could not|not found|no matching|already anchored|enter a passport/i.test(notice)?"alert":"status"} aria-live="polite">{notice}</div>}
   {page==="Overview"&&<section>
    <div className="hero"><div><span className="eyebrow light">AFRICAN ASSET TRUST NETWORK</span><h2>Every asset has a story.<br/>Make its evidence verifiable.</h2><p>Digital passports, inspection workflows and tamper-evident evidence for real-world assets.</p><button className="primary lightbtn" onClick={()=>setPage("Asset register")}>  Register an asset</button></div><div className="hero-symbol">A<span> </span></div></div>
    <div className="stats">{card("REGISTERED ASSETS",assets.length,"Across all categories")}{card("INSPECTION REQUESTS",assets.filter(a=>a.status!=="Inspection report generated").length,"Awaiting completion")}{card("REPORTS GENERATED",assets.filter(a=>a.inspection).length,"Demonstration reports")}{card("EVIDENCE FILES",assets.reduce((n,a)=>n+a.documents.length,0),"Fingerprints calculated")}</div>
    <div className="sectionhead"><div><h3>Recent asset passports</h3><p>Assets registered in this workspace</p></div><button className="textbtn" onClick={()=>setPage("Asset register")}>View register  </button></div>
    <AssetList assets={assets} open={a=>{setSelected(a);setPage("Asset passport")}}/>
    <div className="callout"><strong>What makes AssetChain different?</strong><p>Three evidence layers work together: applicant documents, sensor observations and field inspector findings. Simulated readings are explicitly labelled and never represented as physical measurements.</p></div>
   </section>}
   {page==="Asset register"&&<section className="columns">
    <div className="panel"><h3>Register a real-world asset</h3><p className="muted">Create a digital identity and submit supporting evidence.</p>
     <form onSubmit={register} className="form">
      <label>Asset name<input required placeholder="e.g. Massey Ferguson 375 tractor" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label>Asset category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      <label>Asset location<input required placeholder="City, state, country" value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label>
      <label>Description<textarea placeholder="Model, serial number, identifying details..." value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
      <label>Asset owner
       <select
        value={form.organisationId||""}
        onChange={e=>setForm({...form,organisationId:e.target.value})}
       >
        <option value="">Individual account</option>
        {orgs.map(o=><option key={o.id} value={o.id}>
         {o.display_name||o.legal_name||"Organisation"}
        </option>)}
       </select>
       <small className="muted">
        Choose an organisation only if you are authorised to register this asset on its behalf.
       </small>
      </label>
     <label>
  Supporting documents and images
  <input
    type="file"
    multiple
    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
    onChange={e=>{
      const incoming=Array.from(e.target.files||[]);
      setFiles(prev=>{
        const combined=[...prev];
        incoming.forEach(f=>{
          if(!combined.some(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified)){
            combined.push(f);
          }
        });
        return combined;
      });
      e.target.value="";
    }}
  />
  <small className="muted">
    Select multiple files or add more files in batches. Each file receives its own SHA-256 fingerprint.
  </small>
</label>

{files.length>0&&
  <div className="filelist">
    {files.map((f,i)=>
      <div key={`${f.name}-${f.size}-${f.lastModified}`}>
          {f.name} ({(f.size/1024).toFixed(1)} KB)
        <button type="button" onClick={()=>setFiles(prev=>prev.filter((_,index)=>index!==i))}>
          Remove
        </button>
      </div>
    )}
  </div>
}
      <button className="primary" disabled={busy}>{busy?"Creating passport ":"Create asset passport  "}</button>
     </form>
    </div>
    <div className="panel soft"><span className="eyebrow">REGISTRATION FLOW</span><h3>From claim to evidence</h3><div className="steps"><p><b>01</b> Asset identity created</p><p><b>02</b> Supporting documents fingerprinted</p><p><b>03</b> Inspection request opened</p><p><b>04</b> Inspector assigned</p><p><b>05</b> Findings recorded and report hashed</p></div><div className="caution">Registration does not establish legal ownership or title.</div></div>
   </section>}
   {page==="Inspection centre"&&<section><div className="sectionhead"><div><h3>Field inspection queue</h3><p>Assign an inspector and capture inspection findings.</p></div></div><AssetList assets={assets} open={a=>{setSelected(a);setPage("Asset passport")}}/></section>}
   {page==="Asset passport"&&selected&&<section>
    <button className="textbtn back" onClick={()=>setPage("Overview")}>  Back to overview</button>
    <div className="passport-head"><div><span className="eyebrow">DIGITAL ASSET PASSPORT</span><h2>{selected.name}</h2><p>{selected.passportId}   {selected.category}   {selected.location}</p></div><span className="status-pill">{selected.status}</span></div>
    <div className="panel" style={{marginBottom:"20px"}}>
  <h3>Blockchain verification history</h3>
  <p className="muted">Critical asset events are anchored automatically by the AssetChain platform on Ethereum Sepolia.</p>

  <p className="muted">
    Contract:
    <a href="https://sepolia.etherscan.io/address/0x3b7f78526043e4814ec47ec08bc65e49237e6e31" target="_blank" rel="noreferrer">
      View AssetChain contract  
    </a>
  </p>

  <div className="report">
    <b>{blockchainEvents.length} blockchain event(s)</b>

    {blockchainEvents.length===0 && <p className="muted">No blockchain events recorded yet.</p>}

    {blockchainEvents.map((event,index)=><div className="doc" key={event.eventId||index}>
      <p><b>{(event.eventType||"BLOCKCHAIN EVENT").replaceAll("_"," ")}</b></p>
      <p>
        Status: <strong>{event.status}</strong>
      </p>
      {event.transactionHash && <>
        <p className="muted">Transaction:</p>
        <a href={`https://sepolia.etherscan.io/tx/${event.transactionHash}`} target="_blank" rel="noreferrer">
          View transaction  
        </a>
      </>}
      {event.blockNumber && <p className="muted">Block: {event.blockNumber}</p>}
      {event.lastError && <p className="muted">Pending detail: {event.lastError}</p>}
    </div>)}
  </div>

  <p className="muted">Blockchain anchors verify recorded fingerprints and event integrity. They do not independently establish legal ownership, document authenticity or physical asset condition.</p>
</div>
<div className="columns detailcols">
     <div className="panel"><h3>Inspection workflow</h3><p className="muted">A field visit is simulated for this demonstration.</p>
      <div className="steps"><p><b>01</b> Asset registered <span className="done"> </span></p><p><b>02</b> Documents submitted <span className="done"> </span></p><p><b>03</b> Inspector assignment {selected.inspector?" ":" "}</p><p><b>04</b> Inspection report {selected.inspection?" ":" "}</p></div>
      {!selected.inspector?<button className="primary" onClick={assign}>Assign demonstration inspector</button>:<div className="notice">Assigned: {selected.inspector.name}   {selected.inspector.id}</div>}
      {selected.inspector&&!selected.inspection&&<button className="primary" disabled={busy} onClick={inspect}>Generate inspection report</button>}
      {selected.inspection&&<div className="report"><b>Inspection report generated</b><p>{selected.inspection.id}</p><small>SHA-256: {selected.inspection.hash}</small><p className="muted">SIMULATED REPORT   not a certified physical inspection.</p></div>}
     </div>
     <div className="panel"><h3>IoT sensor simulation</h3><p className="muted">Live demonstration readings   refresh every 2.5 seconds</p><div className="sensorgrid">{readings.map(r=><div className="sensor" key={r.name}><small>{r.name}</small><strong>{r.value}{r.unit==="status"?(r.value?" Detected":" Clear"):" "+r.unit}</strong><span>SIMULATED</span></div>)}</div><div className="caution">Software-generated values only. No physical sensor is connected.</div></div>
    </div>
    <div className="panel hashpanel"><h3>Evidence and record integrity</h3><p>Asset record SHA-256 fingerprint</p><code>{selected.recordHash}</code><h3>Submitted documents ({selected.documents.length})</h3>{selected.documents.length?selected.documents.map(d=><div className="doc" key={d.name}><b>{d.name}</b><code>{d.hash}</code></div>):<p className="muted">No documents submitted.</p>}</div>
   </section>}
   {page==="Asset passport"&&!selected&&<div className="empty">Choose an asset from Overview or the Inspection centre.</div>}
   {page==="Organisation"&&<section>
    <div className="sectionhead">
     <div><h3>Organisation workspace</h3><p>Manage an organisation alongside your individual AssetChain account.</p></div>
    </div>

    {!orgSession&&<div className="panel" style={{maxWidth:"560px"}}>
     <span className="eyebrow">SUPABASE AUTHENTICATION</span>
     <h3>Sign in to your organisation account</h3>
     <p className="muted">Use the email and password of the account you created in Supabase Authentication.</p>
     <form className="form" onSubmit={organisationLogin}>
      <label>Email address
       <input type="email" required value={orgEmail} onChange={e=>setOrgEmail(e.target.value)} placeholder="you@example.com"/>
      </label>
     <PasswordInput
 label="Password"
 value={orgPassword}
 onChange={e=>setOrgPassword(e.target.value)}
 placeholder="Your account password"
 autoComplete="current-password"
/>
      <button className="primary" disabled={orgBusy}>{orgBusy?"Signing in...":"Sign in"}</button>
     </form>
    </div>}

    {orgSession&&<>
     <div className="panel" style={{marginBottom:"20px"}}>
      <div className="sectionhead">
       <div><span className="eyebrow">SIGNED IN</span><h3>{orgSession.user.email}</h3><p className="muted">Individual account with optional organisation memberships.</p></div>
       <button className="textbtn" onClick={organisationLogout}>Sign out</button>
      </div>
     </div>

     <div className="columns">
      <div className="panel">
       <span className="eyebrow">NEW ORGANISATION</span>
       <h3>Create an organisation</h3>
       <p className="muted">The account creating the organisation automatically becomes its owner.</p>
       <form className="form" onSubmit={createOrganisation}>
        <label>Legal organisation name
         <input required value={orgForm.legal_name} onChange={e=>setOrgForm({...orgForm,legal_name:e.target.value})} placeholder="Registered legal name"/>
        </label>
        <label>Display name
         <input required value={orgForm.display_name} onChange={e=>setOrgForm({...orgForm,display_name:e.target.value})} placeholder="Name shown on AssetChain"/>
        </label>
        <label>Organisation type
         <select value={orgForm.organisation_type} onChange={e=>setOrgForm({...orgForm,organisation_type:e.target.value})}>
          <option>Company</option><option>Small business</option><option>Cooperative</option><option>Government agency</option><option>Non-profit</option><option>Institution</option><option>Other</option>
         </select>
        </label>
        <label>Country
         <input required value={orgForm.country} onChange={e=>setOrgForm({...orgForm,country:e.target.value})}/>
        </label>
        <label>Registration number (optional)
         <input value={orgForm.registration_number} onChange={e=>setOrgForm({...orgForm,registration_number:e.target.value})} placeholder="CAC or other registration number"/>
        </label>
        <label>Address (optional)
         <input value={orgForm.address} onChange={e=>setOrgForm({...orgForm,address:e.target.value})}/>
        </label>
        <label>Website (optional)
         <input value={orgForm.website} onChange={e=>setOrgForm({...orgForm,website:e.target.value})} placeholder="https://"/>
        </label>
        <label>Contact email (optional)
         <input type="email" value={orgForm.contact_email} onChange={e=>setOrgForm({...orgForm,contact_email:e.target.value})}/>
        </label>
        <label>Phone (optional)
         <input value={orgForm.phone} onChange={e=>setOrgForm({...orgForm,phone:e.target.value})}/>
        </label>
        <button className="primary" disabled={orgBusy}>{orgBusy?"Creating...":"  Create organisation"}</button>
       </form>
      </div>

      <div className="panel soft">
       <span className="eyebrow">YOUR ORGANISATIONS</span>
       <h3>Organisation dashboard</h3>
       {orgs.length===0?<p className="muted">No active organisation memberships yet. Create your first organisation to get started.</p>:
        orgs.map(item=><div className="report" key={item.id}>
         <b>{item.organisation?.display_name||item.organisation?.legal_name}</b>
         <p>{item.organisation?.organisation_type}   {item.organisation?.country}</p>
         <p>Membership: <strong>{item.role}</strong></p>
         <p>Verification: <strong>{item.organisation?.verification_status}</strong></p>
         <small>{item.organisation?.legal_name}</small>
        </div>)
       }
       <div className="caution">Organisation verification is pending until reviewed. Creating an organisation does not certify its legal status or verify its assets.</div>
      </div>
     </div>
    </>}
   </section>}
   {page==="Profile"&&<section>
    <div className="hero">
     <div>
      <span className="eyebrow light">YOUR ASSETCHAIN IDENTITY</span>
      <h2>Manage your account.<br/>Build your trust profile.</h2>
      <p>Keep your personal details, security and organisation memberships up to date.</p>
     </div>
     <div className="hero-symbol">A<span> </span></div>
    </div>

    <div className="stats">
     {card("ACCOUNT TYPE",orgs.length>0?"Individual + Organisation":"Individual","One account, multiple roles")}
     {card("ORGANISATIONS",orgs.length,"Active memberships returned by the API")}
     {card("EMAIL STATUS",orgSession?.user?.email_confirmed_at?"Verified":"Unverified","Supabase confirmation status")}
     {card("ACCOUNT AGE",orgSession?.user?.created_at?new Date(orgSession.user.created_at).toLocaleDateString():"Available after sign-in","Account creation date")}
    </div>

    <div className="columns">
     <div className="panel">
      <span className="eyebrow">PERSONAL INFORMATION</span>
      <h3>Your profile</h3>
      <div className="profile-identity">
       <div className="profile-avatar">
        {(profileForm.full_name||orgSession?.user?.email||"A").trim().charAt(0).toUpperCase()}
       </div>
       <div>
        <strong>{profileForm.full_name||"Complete your profile"}</strong>
        <small>{orgSession?.user?.email}</small>
       </div>
      </div>
      <form className="form" onSubmit={saveProfile}>
       <label>Full name
        <input value={profileForm.full_name} onChange={e=>setProfileForm({...profileForm,full_name:e.target.value})} placeholder="Your full name" maxLength={100}/>
       </label>
       <label>Username
        <input value={profileForm.username} onChange={e=>setProfileForm({...profileForm,username:e.target.value})} placeholder="Choose a username" maxLength={40}/>
       </label>
       <label>Email address
        <input type="email" value={orgSession?.user?.email||""} readOnly/>
        <small className="muted">Email changes require a separate confirmation process.</small>
       </label>
       <label>Phone number
        <input type="tel" value={profileForm.phone} onChange={e=>setProfileForm({...profileForm,phone:e.target.value})} placeholder="+234..." maxLength={30}/>
       </label>
       <label>Location
        <input value={profileForm.location} onChange={e=>setProfileForm({...profileForm,location:e.target.value})} placeholder="City, state, country" maxLength={120}/>
       </label>
       <label>Website
        <input type="url" value={profileForm.website} onChange={e=>setProfileForm({...profileForm,website:e.target.value})} placeholder="https://example.com" maxLength={200}/>
       </label>
       <label>About you
        <textarea value={profileForm.bio} onChange={e=>setProfileForm({...profileForm,bio:e.target.value})} placeholder="Tell others about your professional background or interests..." maxLength={500}/>
       </label>
       <button className="primary" disabled={profileBusy}>{profileBusy?"Saving...":"Save profile changes"}</button>
      </form>
      <p className="muted">These details are saved as Supabase user metadata. They are profile information, not independently verified credentials.</p>
     </div>

     <div>
      <div className="panel">
       <span className="eyebrow">ACCOUNT SECURITY</span>
       <h3>Security overview</h3>
       <div className="report">
        <b>Email verification</b>
        <p>{orgSession?.user?.email_confirmed_at?"Your email address is confirmed.":"Your email address has not been confirmed yet."}</p>
        <span className="status-pill">{orgSession?.user?.email_confirmed_at?"VERIFIED":"PENDING"}</span>
       </div>
       <div className="report">
        <b>Account identifier</b>
        <p><code>{orgSession?.user?.id||"Unavailable"}</code></p>
       </div>
       <div className="report">
        <b>Authentication provider</b>
        <p>Supabase Auth</p>
       </div>
       <form className="form" onSubmit={changeProfilePassword}>
        <h3>Change password</h3>
       <PasswordInput
 label="New password"
 value={newPassword}
 onChange={e=>setNewPassword(e.target.value)}
 minLength={8}
 autoComplete="new-password"
 placeholder="At least 8 characters"
/>
       <PasswordInput
 label="Confirm new password"
 value={confirmPassword}
 onChange={e=>setConfirmPassword(e.target.value)}
 minLength={8}
 autoComplete="new-password"
 placeholder="Enter the new password again"
/>
        <button className="primary" disabled={profileBusy}>Update password</button>
       </form>
       <p className="muted">Two-factor authentication and session/device management are not enabled in this MVP.</p>
      </div>

      <div className="panel">
       <span className="eyebrow">NOTIFICATION PREFERENCES</span>
       <h3>Choose your updates</h3>
       <div className="preference-row">
        <label><input type="checkbox" checked={profilePrefs.email_updates} onChange={e=>setProfilePrefs({...profilePrefs,email_updates:e.target.checked})}/> Email notifications</label>
       </div>
       <div className="preference-row">
        <label><input type="checkbox" checked={profilePrefs.security_alerts} onChange={e=>setProfilePrefs({...profilePrefs,security_alerts:e.target.checked})}/> Security alerts</label>
       </div>
       <div className="preference-row">
        <label><input type="checkbox" checked={profilePrefs.product_updates} onChange={e=>setProfilePrefs({...profilePrefs,product_updates:e.target.checked})}/> Product announcements</label>
       </div>
       <p className="muted">Save your profile to persist these preferences. Actual email delivery depends on notification services being configured.</p>
       <button className="secondary" onClick={saveProfile}>Save preferences</button>
      </div>
     </div>
    </div>

    <div className="panel">
     <span className="eyebrow">ORGANISATION MEMBERSHIPS</span>
     <h3>Your organisations and roles</h3>
     {orgs.length===0?<p className="muted">You do not currently have an organisation membership. You can create or join an organisation from the Organisation page.</p>:
      orgs.map(item=><div className="report" key={item.id}>
       <b>{item.organisation?.display_name||item.organisation?.legal_name||"Organisation"}</b>
       <p>{item.organisation?.organisation_type||"Organisation"}   {item.organisation?.country||""}</p>
       <p>Your role: <strong>{item.role}</strong></p>
       <p>Verification: {item.organisation?.verification_status||"Not available"}</p>
      </div>)
     }
     <button className="secondary" onClick={()=>setPage("Organisation")}>Manage organisations  </button>
    </div>

    <div className="panel">
     <span className="eyebrow">ASSETCHAIN ACCOUNT ACTIVITY</span>
     <h3>Workspace activity</h3>
     <div className="stats">
      {card("ASSET RECORDS",assets.length,"Currently loaded in this workspace")}
      {card("INSPECTION REPORTS",assets.filter(a=>a.inspection).length,"Reports currently loaded")}
      {card("EVIDENCE FILES",assets.reduce((n,a)=>n+(a.documents?.length||0),0),"Evidence currently loaded")}
      {card("BLOCKCHAIN EVENTS",blockchainEvents.length,"Events for the currently selected passport")}
     </div>
     <p className="muted">These are workspace figures, not a verified personal activity history. Full personal activity tracking requires tenant-scoped asset records and an activity API.</p>
    </div>

    <div className="panel soft">
     <span className="eyebrow">PRIVACY AND ACCOUNT CONTROL</span>
     <h3>Your data and account</h3>
     <p className="muted">Keep your account details accurate and only submit information you are authorised to share. Account export, deletion requests and formal privacy support need dedicated backend workflows before they can be offered as active controls.</p>
     <div className="profile-actions">
      <button className="secondary" onClick={()=>setPage("Organisation")}>Organisation settings</button>
      <button className="textbtn" onClick={organisationLogout}>Sign out of AssetChain</button>
     </div>
    </div>
   </section>}

   {page==="Become an Inspector"&&<section className="columns">
    <div className="panel">
     <span className="eyebrow">INSPECTOR ONBOARDING</span>
     <h3>Apply to become an AssetChain inspector</h3>
     <p className="muted">Tell us about your qualifications, inspection experience and service coverage. Applications are reviewed before any platform inspector access is granted.</p>
     {inspectorApplication?.application_status==="approved"?
      <div className="callout"><strong>Application approved</strong><p>Your platform inspector appointment is active. Inspection assignments will appear in your Inspection centre.</p></div>:
      inspectorApplication?
      <div className="callout">
       <strong>Application status: {inspectorApplication.application_status.replaceAll("_"," ")}</strong>
       <p>Submitted: {new Date(inspectorApplication.created_at).toLocaleDateString()}</p>
       {inspectorApplication.review_notes&&<p>Review note: {inspectorApplication.review_notes}</p>}
       <p>You can contact the platform team if further information is requested.</p>
      </div>:
      <form className="form" onSubmit={submitInspectorApplication}>
       <label>Full name<input required maxLength="120" value={inspectorForm.full_name} onChange={e=>setInspectorForm({...inspectorForm,full_name:e.target.value})}/></label>
       <label>Email address<input required type="email" maxLength="254" value={inspectorForm.email} onChange={e=>setInspectorForm({...inspectorForm,email:e.target.value})}/></label>
       <label>Phone number<input required maxLength="40" value={inspectorForm.phone} onChange={e=>setInspectorForm({...inspectorForm,phone:e.target.value})}/></label>
       <label>Qualifications and certifications<textarea required maxLength="2000" rows="3" value={inspectorForm.qualifications} onChange={e=>setInspectorForm({...inspectorForm,qualifications:e.target.value})} placeholder="Relevant degrees, certifications and professional training"/></label>
       <label>Inspection experience<textarea required maxLength="3000" rows="3" value={inspectorForm.experience} onChange={e=>setInspectorForm({...inspectorForm,experience:e.target.value})} placeholder="Describe relevant inspection or field experience"/></label>
       <label>Areas of specialisation<input required maxLength="200" value={inspectorForm.specialisation} onChange={e=>setInspectorForm({...inspectorForm,specialisation:e.target.value})} placeholder="e.g. vehicles, agricultural equipment, property"/></label>
       <label>Geographical coverage<input required maxLength="200" value={inspectorForm.coverage_area} onChange={e=>setInspectorForm({...inspectorForm,coverage_area:e.target.value})} placeholder="e.g. Abuja, Niger State, North Central Nigeria"/></label>
       <label className="checkline"><input type="checkbox" checked={inspectorConsent} onChange={e=>setInspectorConsent(e.target.checked)}/> I confirm that the information provided is accurate and consent to its use for inspector application review.</label>
       <button className="primary" type="submit" disabled={inspectorBusy}>{inspectorBusy?"Submitting...":"Submit inspector application"}</button>
      </form>
     }
    </div>
    <div className="panel soft">
     <h3>What happens next?</h3>
     <p className="muted">Your application remains pending until reviewed. Platform administrators can review applications and request information or reject them. Only the platform owner can approve and appoint a platform inspector.</p>
     <p className="muted">Submitting an application does not grant inspection permissions or guarantee assignments.</p>
    </div>
   </section>}
   {page==="Platform administration"&&["platform_owner","platform_admin"].includes(platformUser?.platformRole)&&<section>
 <div className="hero">
  <div><span className="eyebrow light">RESTRICTED PLATFORM CONTROL</span><h2>Platform administration</h2><p>Organisation oversight and platform operations.</p></div>
  <div className="hero-symbol">A</div>
 </div>
 <div className="panel">
  <div className="sectionhead">
   <div><h3>Platform overview</h3><p>Live database totals.</p></div>
   <button className="primary" onClick={()=>loadPlatformOverview().catch(e=>setNotice(e.message))}>Refresh data</button>
  </div>
  <div className="stats">
   {card("ORGANISATIONS",platformOverview?.organisations??" ","Organisation records")}
   {card("ASSETS",platformOverview?.assets??" ","Asset records")}
   {card("USERS",platformOverview?.users??" ","User profiles")}
   {card("PLATFORM STAFF",platformOverview?.platformAccounts??" ","Appointments")}
   {card("INSPECTIONS",platformOverview?.inspectionAssignments??" ","Assignments")}
  </div>
 </div>
 <div className="panel">
  <span className="eyebrow">ORGANISATION REVIEW</span>
  <h3>Verification queue</h3>
  {platformOrgs.map(o=><div className="report" key={o.id}>
   <b>{o.display_name||o.legal_name}</b>
   <p>{o.legal_name}   {o.country}</p>
   <p>Status: <strong>{o.verification_status}</strong></p>
   <div className="profile-actions">
    <button className="secondary" onClick={async()=>{try{const r=await apiFetch(API+`/platform/organisations/${o.id}/verification`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"verified"})});const d=await r.json();if(!r.ok)throw Error(d.error||"Update failed");await loadPlatformOverview();setNotice("Organisation marked verified.");}catch(e){setNotice(e.message);}}}>Mark verified</button>
    <button className="textbtn" onClick={async()=>{try{const r=await apiFetch(API+`/platform/organisations/${o.id}/verification`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"needs_information"})});const d=await r.json();if(!r.ok)throw Error(d.error||"Update failed");await loadPlatformOverview();setNotice("Information requested.");}catch(e){setNotice(e.message);}}}>Request information</button>
   </div>
  </div>)}
  {platformOrgs.length===0&&<p className="muted">No organisations loaded. Select Refresh data.</p>}
  <p className="muted">Verification review does not independently establish legal title or prove asset ownership.</p>
 </div>
 <div className="panel">
  <span className="eyebrow">INSPECTOR ONBOARDING</span>
  <h3>INSPECTOR APPLICATION REVIEW QUEUE</h3>
  <div className="sectionhead">
   <p className="muted">Review applicant qualifications and appoint approved platform inspectors.</p>
   <button className="secondary" disabled={inspectorBusy} onClick={()=>loadInspectorApplications().catch(e=>setNotice(e.message))}>Refresh applications</button>
  </div>
  {inspectorApplications.map(a=><div className="report" key={a.id}>
   <b>{a.full_name}</b>
   <p>{a.email}   {a.phone}</p>
   <p><strong>Status:</strong> {a.application_status.replaceAll("_"," ")}</p>
   <p><strong>Qualifications:</strong> {a.qualifications}</p>
   <p><strong>Experience:</strong> {a.experience}</p>
   <p><strong>Specialisation:</strong> {a.specialisation}</p>
   <p><strong>Coverage:</strong> {a.coverage_area}</p>
   {a.review_notes&&<p><strong>Review notes:</strong> {a.review_notes}</p>}
   {a.application_status==="pending"||a.application_status==="needs_information"?
    <div className="profile-actions">
     {platformUser?.platformRole==="platform_owner"&&<button className="primary" disabled={inspectorBusy} onClick={()=>reviewInspectorApplication(a.id,"approved")}>Approve and appoint</button>}
     <button className="secondary" disabled={inspectorBusy} onClick={()=>reviewInspectorApplication(a.id,"needs_information")}>Request information</button>
     <button className="textbtn" disabled={inspectorBusy} onClick={()=>reviewInspectorApplication(a.id,"rejected")}>Reject</button>
    </div>:null}
   </div>)}
  {inspectorApplications.length===0&&<p className="muted">No inspector applications have been submitted yet.</p>}
  {platformUser?.platformRole!=="platform_owner"&&<p className="muted">Platform admins can review applications, but only the platform owner can appoint inspectors.</p>}
 </div></section>}
{page==="Marketplace"&&<section>
    <div className="hero">
     <div>
      <span className="eyebrow light">ASSET DISCOVERY NETWORK</span>
      <h2>Discover assets.<br/>Trade with better evidence.</h2>
      <p>Explore asset passports published by individuals and organisations. Review available evidence before making an offer.</p>
     </div>
     <div className="hero-symbol">A<span>?</span></div>
    </div>

    <div className="stats">
     {card("LIVE LISTINGS",String(marketplaceListings.length),"Published marketplace listings")}
     {card("OFFERS","Enabled","Buyers can submit non-binding offers")}
     {card("SELLER TYPES","2","Individual and organisation accounts")}
     {card("BUYER PROTECTION","Not active","No payment or escrow protection is currently provided")}
    </div>

    <div className="panel">
     <span className="eyebrow">PUBLISH AN ASSET</span>
     <h3>Create a marketplace listing</h3>
     <p className="muted">Only assets registered in the marketplace database can be published. Your account or organisation permissions are checked by the server.</p>
     <form className="form" onSubmit={publishListing}>
      <label>Asset passport
       <select
        required
        value={listingForm.assetId}
        onChange={e=>{
         const asset=assets.find(a=>a.id===e.target.value);
         setListingForm(prev=>({
          ...prev,
          assetId:e.target.value,
          organisationId:asset?.organisationId||""
         }));
        }}
       >
        <option value="">Choose an asset</option>
        {assets.map(a=><option key={a.id} value={a.id}>
         {a.name} ? {a.passportId}
         {a.organisationId?" (Organisation)":" (Individual)"}
        </option>)}
       </select>
      </label>

      <label>Listing type
       <select
        value={listingForm.listingType}
        onChange={e=>setListingForm(prev=>({
         ...prev,
         listingType:e.target.value,
         ownershipPercentage:e.target.value==="full_sale"?"100":prev.ownershipPercentage
        }))}
       >
        <option value="full_sale">Full sale</option>
        <option value="fractional_sale">Fractional sale</option>
       </select>
      </label>

      {listingForm.listingType==="fractional_sale"&&
       <label>Ownership percentage offered
        <input
         type="number" min="0.01" max="100" step="0.01" required
         value={listingForm.ownershipPercentage}
         onChange={e=>setListingForm(prev=>({...prev,ownershipPercentage:e.target.value}))}
        />
       </label>
      }

      <label>Asking price
       <input
        type="number" min="0.01" step="0.01" required
        placeholder="Enter asking price"
        value={listingForm.askingPrice}
        onChange={e=>setListingForm(prev=>({...prev,askingPrice:e.target.value}))}
       />
      </label>

      <label>Currency
       <select
        value={listingForm.currency}
        onChange={e=>setListingForm(prev=>({...prev,currency:e.target.value}))}
       >
        <option value="NGN">NGN ? Nigerian naira</option>
        <option value="USD">USD ? US dollar</option>
        <option value="EUR">EUR ? Euro</option>
        <option value="GBP">GBP ? Pound sterling</option>
       </select>
      </label>

      <button className="primary" disabled={marketplaceBusy||!assets.length}>
       {marketplaceBusy?"Please wait...":"Publish marketplace listing"}
      </button>
      {!assets.length&&
       <small className="muted">Register a new asset passport first. Older local demo records may not yet be synchronised to the marketplace database.</small>
      }
     </form>
    </div>

    <div className="sectionhead">
     <div><h3>Explore published assets</h3><p>Listings submitted by individual and organisation account holders.</p></div>
     <button className="textbtn" onClick={()=>loadMarketplace().catch(e=>setNotice(e.message))}>Refresh listings</button>
    </div>

    {marketplaceListings.length===0?
     <div className="panel">
      <h3>No published listings yet</h3>
      <p className="muted">Be the first to publish an eligible asset passport. No sample or fictional listings are displayed.</p>
     </div>
     :
     <div className="assetlist">
      {marketplaceListings.map(listing=><div className="panel" key={listing.id}>
       <span className="eyebrow">
        {listing.organisation_id?"ORGANISATION LISTING":"INDIVIDUAL LISTING"}
       </span>
       <h3>{listing.asset?.name||"Asset listing"}</h3>
       <p className="muted">
        {listing.asset?.passport_id||""} ? {listing.asset?.category||""} ? {listing.asset?.location||""}
       </p>
       <p><b>{Number(listing.asking_price).toLocaleString()} {listing.currency}</b></p>
       <p className="muted">
        {listing.listing_type==="fractional_sale"?"Fraction offered: "+listing.ownership_percentage+"%":"Full asset listing"}
       </p>
       <p className="muted">Seller: {listing.organisation_id?"Organisation account":"Individual account"}</p>
       <p className="muted">Legal review: {listing.legal_review_status||"Not reviewed"}</p>
       <div className="caution">
        A marketplace listing is a seller-submitted claim. It does not establish legal title, ownership or physical condition. Conduct independent due diligence.
       </div>
       <label>Make an offer ({listing.currency})
        <input
         type="number" min="0.01" step="0.01"
         placeholder="Your offer amount"
         value={offerAmounts[listing.id]||""}
         onChange={e=>setOfferAmounts(prev=>({...prev,[listing.id]:e.target.value}))}
        />
       </label>
       <button
        type="button"
        className="primary"
        disabled={marketplaceBusy}
        onClick={()=>submitOffer(listing.id)}
       >Submit offer</button>
      </div>)}
     </div>
    }

    <div className="caution">
     Offers are recorded for discussion only. AssetChain does not currently process payments, transfer legal ownership, provide escrow or guarantee buyer protection.
    </div>
   </section>}
   {page==="Verify passport"&&<section className="panel verify"><span className="eyebrow">PUBLIC VERIFICATION</span><h2>Verify an asset passport</h2><p className="muted">Enter the passport ID to inspect its recorded identity and evidence fingerprints.</p><form onSubmit={verifyPassport}><input placeholder="e.g. AC-..." value={verify} onChange={e=>setVerify(e.target.value)} required/><button className="primary">Verify passport</button></form>{verified&&<div className="report"><b>{verified===false?"No matching passport found":"Passport record found"}</b>{verified!==false&&<><p>{verified.name}   {verified.category}</p><p>{verified.passportId}   {verified.location}</p><code>{verified.recordHash}</code><p className="muted">This confirms a matching record in this running demo API, not legal title or an on-chain transaction.</p></>}</div>}</section>}
   <footer>ASSETCHAIN   Verifiable Real-World Asset Passports <span>Hackathon demonstration   Simulated data is labelled</span></footer>
  </main>
 </div>
}
function AssetList({assets,open}){
 if(!assets.length)return <div className="empty">No assets registered yet. Register your first asset to begin.</div>;
 return <div className="assetlist">{assets.map(a=><button className="assetrow" key={a.id} onClick={()=>open(a)}><span className="asseticon">{a.category==="Vehicle"?" ":a.category==="Real estate"?" ":" "}</span><span className="assetinfo"><b>{a.name}</b><small>{a.passportId}   {a.location}</small></span><span className="assetstatus">{a.status}</span><span> </span></button>)}</div>
}
export default App;









