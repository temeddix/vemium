var Po=class{get shadowRoot(){return this.__host.__shadowRoot}constructor(t){this.ariaActiveDescendantElement=null,this.ariaAtomic="",this.ariaAutoComplete="",this.ariaBrailleLabel="",this.ariaBrailleRoleDescription="",this.ariaBusy="",this.ariaChecked="",this.ariaColCount="",this.ariaColIndex="",this.ariaColIndexText="",this.ariaColSpan="",this.ariaControlsElements=null,this.ariaCurrent="",this.ariaDescribedByElements=null,this.ariaDescription="",this.ariaDetailsElements=null,this.ariaDisabled="",this.ariaErrorMessageElements=null,this.ariaExpanded="",this.ariaFlowToElements=null,this.ariaHasPopup="",this.ariaHidden="",this.ariaInvalid="",this.ariaKeyShortcuts="",this.ariaLabel="",this.ariaLabelledByElements=null,this.ariaLevel="",this.ariaLive="",this.ariaModal="",this.ariaMultiLine="",this.ariaMultiSelectable="",this.ariaOrientation="",this.ariaOwnsElements=null,this.ariaPlaceholder="",this.ariaPosInSet="",this.ariaPressed="",this.ariaReadOnly="",this.ariaRelevant="",this.ariaRequired="",this.ariaRoleDescription="",this.ariaRowCount="",this.ariaRowIndex="",this.ariaRowIndexText="",this.ariaRowSpan="",this.ariaSelected="",this.ariaSetSize="",this.ariaSort="",this.ariaValueMax="",this.ariaValueMin="",this.ariaValueNow="",this.ariaValueText="",this.role="",this.form=null,this.labels=[],this.states=new Set,this.validationMessage="",this.validity={},this.willValidate=!0,this.__host=t}checkValidity(){return console.warn("`ElementInternals.checkValidity()` was called on the server.This method always returns true."),!0}reportValidity(){return!0}setFormValue(){}setValidity(){}};var vt=function(r,t,e,o,i){if(o==="m")throw new TypeError("Private method is not writable");if(o==="a"&&!i)throw new TypeError("Private accessor was defined without a setter");if(typeof t=="function"?r!==t||!i:!t.has(r))throw new TypeError("Cannot write private member to an object whose class did not declare it");return o==="a"?i.call(r,e):i?i.value=e:t.set(r,e),e},J=function(r,t,e,o){if(e==="a"&&!o)throw new TypeError("Private accessor was defined without a getter");if(typeof t=="function"?r!==t||!o:!t.has(r))throw new TypeError("Cannot read private member from an object whose class did not declare it");return e==="m"?o:e==="a"?o.call(r):o?o.value:t.get(r)},oe,Qe,Je,we,Mr,ve,tr,qt,ye,Ot,er,Mo,Io=r=>typeof r=="boolean"?r:r?.capture??!1;var Ir=class{constructor(){this.__eventListeners=new Map,this.__captureEventListeners=new Map}addEventListener(t,e,o){if(e==null)return;let i=Io(o)?this.__captureEventListeners:this.__eventListeners,s=i.get(t);if(s===void 0)s=new Map,i.set(t,s);else if(s.has(e))return;let n=typeof o=="object"&&o?o:{};n.signal?.addEventListener("abort",()=>this.removeEventListener(t,e,o)),s.set(e,n??{})}removeEventListener(t,e,o){if(e==null)return;let i=Io(o)?this.__captureEventListeners:this.__eventListeners,s=i.get(t);s!==void 0&&(s.delete(e),s.size||i.delete(t))}dispatchEvent(t){let e=[this],o=this.__eventTargetParent;if(t.composed)for(;o;)e.push(o),o=o.__eventTargetParent;else for(;o&&o!==this.__host;)e.push(o),o=o.__eventTargetParent;let i=!1,s=!1,n=0,c=null,h=null,g=null,l=t.stopPropagation,a=t.stopImmediatePropagation;Object.defineProperties(t,{target:{get(){return c??h},...N},srcElement:{get(){return t.target},...N},currentTarget:{get(){return g},...N},eventPhase:{get(){return n},...N},composedPath:{value:()=>e,...N},stopPropagation:{value:()=>{i=!0,l.call(t)},...N},stopImmediatePropagation:{value:()=>{s=!0,a.call(t)},...N}});let p=(k,E,y)=>{typeof k=="function"?k(t):typeof k?.handleEvent=="function"&&k.handleEvent(t),E.once&&y.delete(k)},d=()=>(g=null,n=0,!t.defaultPrevented),u=e.slice().reverse();c=!this.__host||!t.composed?this:null;let C=k=>{for(h=this;h.__host&&k.includes(h.__host);)h=h.__host};for(let k of u){!c&&(!h||h===k.__host)&&C(u.slice(u.indexOf(k))),g=k,n=k===t.target?2:1;let E=k.__captureEventListeners.get(t.type);if(E){for(let[y,w]of E)if(p(y,w,E),s)return d()}if(i)return d()}let _=t.bubbles?e:[this];h=null;for(let k of _){!c&&(!h||k===h.__host)&&C(_.slice(0,_.indexOf(k)+1)),g=k,n=k===t.target?2:3;let E=k.__eventListeners.get(t.type);if(E){for(let[y,w]of E)if(p(y,w,E),s)return d()}if(i)return d()}return d()}},Dr=Ir;var N={__proto__:null};N.enumerable=!0;Object.freeze(N);var Fr=(Ot=class{constructor(t,e={}){if(oe.set(this,!1),Qe.set(this,!1),Je.set(this,!1),we.set(this,!1),Mr.set(this,Date.now()),ve.set(this,!1),tr.set(this,void 0),qt.set(this,void 0),ye.set(this,void 0),this.NONE=0,this.CAPTURING_PHASE=1,this.AT_TARGET=2,this.BUBBLING_PHASE=3,arguments.length===0)throw new Error("The type argument must be specified");if(typeof e!="object"||!e)throw new Error('The "options" argument must be an object');let{bubbles:o,cancelable:i,composed:s}=e;vt(this,oe,!!i,"f"),vt(this,Qe,!!o,"f"),vt(this,Je,!!s,"f"),vt(this,tr,`${t}`,"f"),vt(this,qt,null,"f"),vt(this,ye,!1,"f")}initEvent(t,e,o){throw new Error("Method not implemented.")}stopImmediatePropagation(){this.stopPropagation()}preventDefault(){vt(this,we,!0,"f")}get target(){return J(this,qt,"f")}get currentTarget(){return J(this,qt,"f")}get srcElement(){return J(this,qt,"f")}get type(){return J(this,tr,"f")}get cancelable(){return J(this,oe,"f")}get defaultPrevented(){return J(this,oe,"f")&&J(this,we,"f")}get timeStamp(){return J(this,Mr,"f")}composedPath(){return J(this,ye,"f")?[J(this,qt,"f")]:[]}get returnValue(){return!J(this,oe,"f")||!J(this,we,"f")}get bubbles(){return J(this,Qe,"f")}get composed(){return J(this,Je,"f")}get eventPhase(){return J(this,ye,"f")?Ot.AT_TARGET:Ot.NONE}get cancelBubble(){return J(this,ve,"f")}set cancelBubble(t){t&&vt(this,ve,!0,"f")}stopPropagation(){vt(this,ve,!0,"f")}get isTrusted(){return!1}},oe=new WeakMap,Qe=new WeakMap,Je=new WeakMap,we=new WeakMap,Mr=new WeakMap,ve=new WeakMap,tr=new WeakMap,qt=new WeakMap,ye=new WeakMap,Ot.NONE=0,Ot.CAPTURING_PHASE=1,Ot.AT_TARGET=2,Ot.BUBBLING_PHASE=3,Ot);Object.defineProperties(Fr.prototype,{initEvent:N,stopImmediatePropagation:N,preventDefault:N,target:N,currentTarget:N,srcElement:N,type:N,cancelable:N,defaultPrevented:N,timeStamp:N,composedPath:N,returnValue:N,bubbles:N,composed:N,eventPhase:N,cancelBubble:N,stopPropagation:N,isTrusted:N});var Do=(Mo=class extends Fr{constructor(t,e={}){super(t,e),er.set(this,void 0),vt(this,er,e?.detail??null,"f")}initCustomEvent(t,e,o,i){throw new Error("Method not implemented.")}get detail(){return J(this,er,"f")}},er=new WeakMap,Mo);Object.defineProperties(Do.prototype,{detail:N});var qr=Fr,Br=Do;var lt;var cc=(lt=class{constructor(){this.STYLE_RULE=1,this.CHARSET_RULE=2,this.IMPORT_RULE=3,this.MEDIA_RULE=4,this.FONT_FACE_RULE=5,this.PAGE_RULE=6,this.NAMESPACE_RULE=10,this.KEYFRAMES_RULE=7,this.KEYFRAME_RULE=8,this.SUPPORTS_RULE=12,this.COUNTER_STYLE_RULE=11,this.FONT_FEATURE_VALUES_RULE=14,this.__parentStyleSheet=null,this.cssText=""}get parentRule(){return null}get parentStyleSheet(){return this.__parentStyleSheet}get type(){return 0}},lt.STYLE_RULE=1,lt.CHARSET_RULE=2,lt.IMPORT_RULE=3,lt.MEDIA_RULE=4,lt.FONT_FACE_RULE=5,lt.PAGE_RULE=6,lt.NAMESPACE_RULE=10,lt.KEYFRAMES_RULE=7,lt.KEYFRAME_RULE=8,lt.SUPPORTS_RULE=12,lt.COUNTER_STYLE_RULE=11,lt.FONT_FEATURE_VALUES_RULE=14,lt);globalThis.Event??=qr;globalThis.CustomEvent??=Br;var Fo=new WeakMap,xe=r=>{let t=Fo.get(r);return t===void 0&&Fo.set(r,t=new Map),t},Xn=class extends Dr{constructor(){super(...arguments),this.__shadowRootMode=null,this.__shadowRoot=null,this.__internals=null}get attributes(){return Array.from(xe(this)).map(([t,e])=>({name:t,value:e}))}get shadowRoot(){return this.__shadowRootMode==="closed"?null:this.__shadowRoot}get localName(){return this.constructor.__localName}get tagName(){return this.localName?.toUpperCase()}setAttribute(t,e){xe(this).set(t,String(e))}removeAttribute(t){xe(this).delete(t)}toggleAttribute(t,e){if(this.hasAttribute(t)){if(e===void 0||!e)return this.removeAttribute(t),!1}else return e===void 0||e?(this.setAttribute(t,""),!0):!1;return!0}hasAttribute(t){return xe(this).has(t)}attachShadow(t){let e={host:this};return this.__shadowRootMode=t.mode,t&&t.mode==="open"&&(this.__shadowRoot=e),e}attachInternals(){if(this.__internals!==null)throw new Error("Failed to execute 'attachInternals' on 'HTMLElement': ElementInternals for the specified element was already attached.");let t=new Po(this);return this.__internals=t,t}getAttribute(t){return xe(this).get(t)??null}};var Qn=class extends Xn{},Vr=Qn;globalThis.litServerRoot??=Object.defineProperty(new Vr,"localName",{get(){return"lit-server-root"}});function Jn(){let r,t;return{promise:new Promise((o,i)=>{r=o,t=i}),resolve:r,reject:t}}var Nr=class{constructor(){this.__definitions=new Map,this.__reverseDefinitions=new Map,this.__pendingWhenDefineds=new Map}define(t,e){if(this.__definitions.has(t))throw new Error(`Failed to execute 'define' on 'CustomElementRegistry': the name "${t}" has already been used with this registry`);if(this.__reverseDefinitions.has(e))throw new Error(`Failed to execute 'define' on 'CustomElementRegistry': the constructor has already been used with this registry for the tag name ${this.__reverseDefinitions.get(e)}`);e.__localName=t,this.__definitions.set(t,{ctor:e,observedAttributes:e.observedAttributes??[]}),this.__reverseDefinitions.set(e,t),this.__pendingWhenDefineds.get(t)?.resolve(e),this.__pendingWhenDefineds.delete(t)}get(t){return this.__definitions.get(t)?.ctor}getName(t){return this.__reverseDefinitions.get(t)??null}upgrade(t){throw new Error("customElements.upgrade is not currently supported in SSR. Please file a bug if you need it.")}async whenDefined(t){let e=this.__definitions.get(t);if(e)return e.ctor;let o=this.__pendingWhenDefineds.get(t);return o||(o=Jn(),this.__pendingWhenDefineds.set(t,o)),o.promise}},ta=Nr;var qo=new ta;var Ce=globalThis,rr=Ce.ShadowRoot&&(Ce.ShadyCSS===void 0||Ce.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,Ur=Symbol(),Bo=new WeakMap,_e=class{constructor(t,e,o){if(this._$cssResult$=!0,o!==Ur)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=t,this.t=e}get styleSheet(){let t=this.o,e=this.t;if(rr&&t===void 0){let o=e!==void 0&&e.length===1;o&&(t=Bo.get(e)),t===void 0&&((this.o=t=new CSSStyleSheet).replaceSync(this.cssText),o&&Bo.set(e,t))}return t}toString(){return this.cssText}},No=r=>new _e(typeof r=="string"?r:r+"",void 0,Ur),z=(r,...t)=>{let e=r.length===1?r[0]:t.reduce((o,i,s)=>o+(n=>{if(n._$cssResult$===!0)return n.cssText;if(typeof n=="number")return n;throw Error("Value passed to 'css' function must be a 'css' function result: "+n+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(i)+r[s+1],r[0]);return new _e(e,r,Ur)},Vo=(r,t)=>{if(rr)r.adoptedStyleSheets=t.map(e=>e instanceof CSSStyleSheet?e:e.styleSheet);else for(let e of t){let o=document.createElement("style"),i=Ce.litNonce;i!==void 0&&o.setAttribute("nonce",i),o.textContent=e.cssText,r.appendChild(o)}},Hr=rr||Ce.CSSStyleSheet===void 0?r=>r:r=>r instanceof CSSStyleSheet?(t=>{let e="";for(let o of t.cssRules)e+=o.cssText;return No(e)})(r):r;var{is:ea,defineProperty:ra,getOwnPropertyDescriptor:oa,getOwnPropertyNames:ia,getOwnPropertySymbols:sa,getPrototypeOf:na}=Object,Ee=globalThis;Ee.customElements??=qo;var Uo=Ee.trustedTypes,aa=Uo?Uo.emptyScript:"",la=Ee.reactiveElementPolyfillSupport,ke=(r,t)=>r,Se={toAttribute(r,t){switch(t){case Boolean:r=r?aa:null;break;case Object:case Array:r=r==null?r:JSON.stringify(r)}return r},fromAttribute(r,t){let e=r;switch(t){case Boolean:e=r!==null;break;case Number:e=r===null?null:Number(r);break;case Object:case Array:try{e=JSON.parse(r)}catch{e=null}}return e}},or=(r,t)=>!ea(r,t),Ho={attribute:!0,type:String,converter:Se,reflect:!1,useDefault:!1,hasChanged:or};Symbol.metadata??=Symbol("metadata"),Ee.litPropertyMetadata??=new WeakMap;var St=class extends(globalThis.HTMLElement??Vr){static addInitializer(t){this._$Ei(),(this.l??=[]).push(t)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(t,e=Ho){if(e.state&&(e.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(t)&&((e=Object.create(e)).wrapped=!0),this.elementProperties.set(t,e),!e.noAccessor){let o=Symbol(),i=this.getPropertyDescriptor(t,o,e);i!==void 0&&ra(this.prototype,t,i)}}static getPropertyDescriptor(t,e,o){let{get:i,set:s}=oa(this.prototype,t)??{get(){return this[e]},set(n){this[e]=n}};return{get:i,set(n){let c=i?.call(this);s?.call(this,n),this.requestUpdate(t,c,o)},configurable:!0,enumerable:!0}}static getPropertyOptions(t){return this.elementProperties.get(t)??Ho}static _$Ei(){if(this.hasOwnProperty(ke("elementProperties")))return;let t=na(this);t.finalize(),t.l!==void 0&&(this.l=[...t.l]),this.elementProperties=new Map(t.elementProperties)}static finalize(){if(this.hasOwnProperty(ke("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(ke("properties"))){let e=this.properties,o=[...ia(e),...sa(e)];for(let i of o)this.createProperty(i,e[i])}let t=this[Symbol.metadata];if(t!==null){let e=litPropertyMetadata.get(t);if(e!==void 0)for(let[o,i]of e)this.elementProperties.set(o,i)}this._$Eh=new Map;for(let[e,o]of this.elementProperties){let i=this._$Eu(e,o);i!==void 0&&this._$Eh.set(i,e)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(t){let e=[];if(Array.isArray(t)){let o=new Set(t.flat(1/0).reverse());for(let i of o)e.unshift(Hr(i))}else t!==void 0&&e.push(Hr(t));return e}static _$Eu(t,e){let o=e.attribute;return o===!1?void 0:typeof o=="string"?o:typeof t=="string"?t.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(t=>this.enableUpdating=t),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(t=>t(this))}addController(t){(this._$EO??=new Set).add(t),this.renderRoot!==void 0&&this.isConnected&&t.hostConnected?.()}removeController(t){this._$EO?.delete(t)}_$E_(){let t=new Map,e=this.constructor.elementProperties;for(let o of e.keys())this.hasOwnProperty(o)&&(t.set(o,this[o]),delete this[o]);t.size>0&&(this._$Ep=t)}createRenderRoot(){let t=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return Vo(t,this.constructor.elementStyles),t}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach(t=>t.hostConnected?.())}enableUpdating(t){}disconnectedCallback(){this._$EO?.forEach(t=>t.hostDisconnected?.())}attributeChangedCallback(t,e,o){this._$AK(t,o)}_$ET(t,e){let o=this.constructor.elementProperties.get(t),i=this.constructor._$Eu(t,o);if(i!==void 0&&o.reflect===!0){let s=(o.converter?.toAttribute!==void 0?o.converter:Se).toAttribute(e,o.type);this._$Em=t,s==null?this.removeAttribute(i):this.setAttribute(i,s),this._$Em=null}}_$AK(t,e){let o=this.constructor,i=o._$Eh.get(t);if(i!==void 0&&this._$Em!==i){let s=o.getPropertyOptions(i),n=typeof s.converter=="function"?{fromAttribute:s.converter}:s.converter?.fromAttribute!==void 0?s.converter:Se;this._$Em=i;let c=n.fromAttribute(e,s.type);this[i]=c??this._$Ej?.get(i)??c,this._$Em=null}}requestUpdate(t,e,o,i=!1,s){if(t!==void 0){let n=this.constructor;if(i===!1&&(s=this[t]),o??=n.getPropertyOptions(t),!((o.hasChanged??or)(s,e)||o.useDefault&&o.reflect&&s===this._$Ej?.get(t)&&!this.hasAttribute(n._$Eu(t,o))))return;this.C(t,e,o)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(t,e,{useDefault:o,reflect:i,wrapped:s},n){o&&!(this._$Ej??=new Map).has(t)&&(this._$Ej.set(t,n??e??this[t]),s!==!0||n!==void 0)||(this._$AL.has(t)||(this.hasUpdated||o||(e=void 0),this._$AL.set(t,e)),i===!0&&this._$Em!==t&&(this._$Eq??=new Set).add(t))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(e){Promise.reject(e)}let t=this.scheduleUpdate();return t!=null&&await t,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(let[i,s]of this._$Ep)this[i]=s;this._$Ep=void 0}let o=this.constructor.elementProperties;if(o.size>0)for(let[i,s]of o){let{wrapped:n}=s,c=this[i];n!==!0||this._$AL.has(i)||c===void 0||this.C(i,void 0,s,c)}}let t=!1,e=this._$AL;try{t=this.shouldUpdate(e),t?(this.willUpdate(e),this._$EO?.forEach(o=>o.hostUpdate?.()),this.update(e)):this._$EM()}catch(o){throw t=!1,this._$EM(),o}t&&this._$AE(e)}willUpdate(t){}_$AE(t){this._$EO?.forEach(e=>e.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(t)),this.updated(t)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(t){return!0}update(t){this._$Eq&&=this._$Eq.forEach(e=>this._$ET(e,this[e])),this._$EM()}updated(t){}firstUpdated(t){}};St.elementStyles=[],St.shadowRootOptions={mode:"open"},St[ke("elementProperties")]=new Map,St[ke("finalized")]=new Map,la?.({ReactiveElement:St}),(Ee.reactiveElementVersions??=[]).push("2.1.2");var ur=globalThis,Wo=r=>r,ir=ur.trustedTypes,jo=ir?ir.createPolicy("lit-html",{createHTML:r=>r}):void 0,jr="$lit$",Et=`lit$${Math.random().toFixed(9).slice(2)}$`,Yr="?"+Et,ca=`<${Yr}>`,Vt=ur.document===void 0?{createTreeWalker:()=>({})}:document,Ae=()=>Vt.createComment(""),Le=r=>r===null||typeof r!="object"&&typeof r!="function",Kr=Array.isArray,Qo=r=>Kr(r)||typeof r?.[Symbol.iterator]=="function",Wr=`[ 	
\f\r]`,$e=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,Yo=/-->/g,Ko=/>/g,Bt=RegExp(`>|${Wr}(?:([^\\s"'>=/]+)(${Wr}*=${Wr}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),Go=/'/g,Zo=/"/g,Jo=/^(?:script|style|textarea|title)$/i,Gr=r=>(t,...e)=>({_$litType$:r,strings:t,values:e}),S=Gr(1),ti=Gr(2),ei=Gr(3),ot=Symbol.for("lit-noChange"),Y=Symbol.for("lit-nothing"),Xo=new WeakMap,Nt=Vt.createTreeWalker(Vt,129);function ri(r,t){if(!Kr(r)||!r.hasOwnProperty("raw"))throw Error("invalid template strings array");return jo!==void 0?jo.createHTML(t):t}var oi=(r,t)=>{let e=r.length-1,o=[],i,s=t===2?"<svg>":t===3?"<math>":"",n=$e;for(let c=0;c<e;c++){let h=r[c],g,l,a=-1,p=0;for(;p<h.length&&(n.lastIndex=p,l=n.exec(h),l!==null);)p=n.lastIndex,n===$e?l[1]==="!--"?n=Yo:l[1]!==void 0?n=Ko:l[2]!==void 0?(Jo.test(l[2])&&(i=RegExp("</"+l[2],"g")),n=Bt):l[3]!==void 0&&(n=Bt):n===Bt?l[0]===">"?(n=i??$e,a=-1):l[1]===void 0?a=-2:(a=n.lastIndex-l[2].length,g=l[1],n=l[3]===void 0?Bt:l[3]==='"'?Zo:Go):n===Zo||n===Go?n=Bt:n===Yo||n===Ko?n=$e:(n=Bt,i=void 0);let d=n===Bt&&r[c+1].startsWith("/>")?" ":"";s+=n===$e?h+ca:a>=0?(o.push(g),h.slice(0,a)+jr+h.slice(a)+Et+d):h+Et+(a===-2?c:d)}return[ri(r,s+(r[e]||"<?>")+(t===2?"</svg>":t===3?"</math>":"")),o]},Re=class r{constructor({strings:t,_$litType$:e},o){let i;this.parts=[];let s=0,n=0,c=t.length-1,h=this.parts,[g,l]=oi(t,e);if(this.el=r.createElement(g,o),Nt.currentNode=this.el.content,e===2||e===3){let a=this.el.content.firstChild;a.replaceWith(...a.childNodes)}for(;(i=Nt.nextNode())!==null&&h.length<c;){if(i.nodeType===1){if(i.hasAttributes())for(let a of i.getAttributeNames())if(a.endsWith(jr)){let p=l[n++],d=i.getAttribute(a).split(Et),u=/([.?@])?(.*)/.exec(p);h.push({type:1,index:s,name:u[2],strings:d,ctor:u[1]==="."?nr:u[1]==="?"?ar:u[1]==="@"?lr:Ht}),i.removeAttribute(a)}else a.startsWith(Et)&&(h.push({type:6,index:s}),i.removeAttribute(a));if(Jo.test(i.tagName)){let a=i.textContent.split(Et),p=a.length-1;if(p>0){i.textContent=ir?ir.emptyScript:"";for(let d=0;d<p;d++)i.append(a[d],Ae()),Nt.nextNode(),h.push({type:2,index:++s});i.append(a[p],Ae())}}}else if(i.nodeType===8)if(i.data===Yr)h.push({type:2,index:s});else{let a=-1;for(;(a=i.data.indexOf(Et,a+1))!==-1;)h.push({type:7,index:s}),a+=Et.length-1}s++}}static createElement(t,e){let o=Vt.createElement("template");return o.innerHTML=t,o}};function Ut(r,t,e=r,o){if(t===ot)return t;let i=o!==void 0?e._$Co?.[o]:e._$Cl,s=Le(t)?void 0:t._$litDirective$;return i?.constructor!==s&&(i?._$AO?.(!1),s===void 0?i=void 0:(i=new s(r),i._$AT(r,e,o)),o!==void 0?(e._$Co??=[])[o]=i:e._$Cl=i),i!==void 0&&(t=Ut(r,i._$AS(r,t.values),i,o)),t}var sr=class{constructor(t,e){this._$AV=[],this._$AN=void 0,this._$AD=t,this._$AM=e}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(t){let{el:{content:e},parts:o}=this._$AD,i=(t?.creationScope??Vt).importNode(e,!0);Nt.currentNode=i;let s=Nt.nextNode(),n=0,c=0,h=o[0];for(;h!==void 0;){if(n===h.index){let g;h.type===2?g=new ie(s,s.nextSibling,this,t):h.type===1?g=new h.ctor(s,h.name,h.strings,this,t):h.type===6&&(g=new cr(s,this,t)),this._$AV.push(g),h=o[++c]}n!==h?.index&&(s=Nt.nextNode(),n++)}return Nt.currentNode=Vt,i}p(t){let e=0;for(let o of this._$AV)o!==void 0&&(o.strings!==void 0?(o._$AI(t,o,e),e+=o.strings.length-2):o._$AI(t[e])),e++}},ie=class r{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(t,e,o,i){this.type=2,this._$AH=Y,this._$AN=void 0,this._$AA=t,this._$AB=e,this._$AM=o,this.options=i,this._$Cv=i?.isConnected??!0}get parentNode(){let t=this._$AA.parentNode,e=this._$AM;return e!==void 0&&t?.nodeType===11&&(t=e.parentNode),t}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(t,e=this){t=Ut(this,t,e),Le(t)?t===Y||t==null||t===""?(this._$AH!==Y&&this._$AR(),this._$AH=Y):t!==this._$AH&&t!==ot&&this._(t):t._$litType$!==void 0?this.$(t):t.nodeType!==void 0?this.T(t):Qo(t)?this.k(t):this._(t)}O(t){return this._$AA.parentNode.insertBefore(t,this._$AB)}T(t){this._$AH!==t&&(this._$AR(),this._$AH=this.O(t))}_(t){this._$AH!==Y&&Le(this._$AH)?this._$AA.nextSibling.data=t:this.T(Vt.createTextNode(t)),this._$AH=t}$(t){let{values:e,_$litType$:o}=t,i=typeof o=="number"?this._$AC(t):(o.el===void 0&&(o.el=Re.createElement(ri(o.h,o.h[0]),this.options)),o);if(this._$AH?._$AD===i)this._$AH.p(e);else{let s=new sr(i,this),n=s.u(this.options);s.p(e),this.T(n),this._$AH=s}}_$AC(t){let e=Xo.get(t.strings);return e===void 0&&Xo.set(t.strings,e=new Re(t)),e}k(t){Kr(this._$AH)||(this._$AH=[],this._$AR());let e=this._$AH,o,i=0;for(let s of t)i===e.length?e.push(o=new r(this.O(Ae()),this.O(Ae()),this,this.options)):o=e[i],o._$AI(s),i++;i<e.length&&(this._$AR(o&&o._$AB.nextSibling,i),e.length=i)}_$AR(t=this._$AA.nextSibling,e){for(this._$AP?.(!1,!0,e);t!==this._$AB;){let o=Wo(t).nextSibling;Wo(t).remove(),t=o}}setConnected(t){this._$AM===void 0&&(this._$Cv=t,this._$AP?.(t))}},Ht=class{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(t,e,o,i,s){this.type=1,this._$AH=Y,this._$AN=void 0,this.element=t,this.name=e,this._$AM=i,this.options=s,o.length>2||o[0]!==""||o[1]!==""?(this._$AH=Array(o.length-1).fill(new String),this.strings=o):this._$AH=Y}_$AI(t,e=this,o,i){let s=this.strings,n=!1;if(s===void 0)t=Ut(this,t,e,0),n=!Le(t)||t!==this._$AH&&t!==ot,n&&(this._$AH=t);else{let c=t,h,g;for(t=s[0],h=0;h<s.length-1;h++)g=Ut(this,c[o+h],e,h),g===ot&&(g=this._$AH[h]),n||=!Le(g)||g!==this._$AH[h],g===Y?t=Y:t!==Y&&(t+=(g??"")+s[h+1]),this._$AH[h]=g}n&&!i&&this.j(t)}j(t){t===Y?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,t??"")}},nr=class extends Ht{constructor(){super(...arguments),this.type=3}j(t){this.element[this.name]=t===Y?void 0:t}},ar=class extends Ht{constructor(){super(...arguments),this.type=4}j(t){this.element.toggleAttribute(this.name,!!t&&t!==Y)}},lr=class extends Ht{constructor(t,e,o,i,s){super(t,e,o,i,s),this.type=5}_$AI(t,e=this){if((t=Ut(this,t,e,0)??Y)===ot)return;let o=this._$AH,i=t===Y&&o!==Y||t.capture!==o.capture||t.once!==o.once||t.passive!==o.passive,s=t!==Y&&(o===Y||i);i&&this.element.removeEventListener(this.name,this,o),s&&this.element.addEventListener(this.name,this,t),this._$AH=t}handleEvent(t){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,t):this._$AH.handleEvent(t)}},cr=class{constructor(t,e,o){this.element=t,this.type=6,this._$AN=void 0,this._$AM=e,this.options=o}get _$AU(){return this._$AM._$AU}_$AI(t){Ut(this,t)}},ii={M:jr,P:Et,A:Yr,C:1,L:oi,R:sr,D:Qo,V:Ut,I:ie,H:Ht,N:ar,U:lr,B:nr,F:cr},ua=ur.litHtmlPolyfillSupport;ua?.(Re,ie),(ur.litHtmlVersions??=[]).push("3.3.2");var si=(r,t,e)=>{let o=e?.renderBefore??t,i=o._$litPart$;if(i===void 0){let s=e?.renderBefore??null;o._$litPart$=i=new ie(t.insertBefore(Ae(),s),s,void 0,e??{})}return i._$AI(r),i};var Zr=globalThis,it=class extends St{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){let t=super.createRenderRoot();return this.renderOptions.renderBefore??=t.firstChild,t}update(t){let e=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(t),this._$Do=si(e,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return ot}};it._$litElement$=!0,it.finalized=!0,Zr.litElementHydrateSupport?.({LitElement:it});var ha=Zr.litElementPolyfillSupport;ha?.({LitElement:it});(Zr.litElementVersions??=[]).push("4.2.2");var B=r=>(t,e)=>{e!==void 0?e.addInitializer(()=>{customElements.define(r,t)}):customElements.define(r,t)};var da={attribute:!0,type:String,converter:Se,reflect:!1,hasChanged:or},pa=(r=da,t,e)=>{let{kind:o,metadata:i}=e,s=globalThis.litPropertyMetadata.get(i);if(s===void 0&&globalThis.litPropertyMetadata.set(i,s=new Map),o==="setter"&&((r=Object.create(r)).wrapped=!0),s.set(e.name,r),o==="accessor"){let{name:n}=e;return{set(c){let h=t.get.call(this);t.set.call(this,c),this.requestUpdate(n,h,r,!0,c)},init(c){return c!==void 0&&this.C(n,void 0,r,c),c}}}if(o==="setter"){let{name:n}=e;return function(c){let h=this[n];t.call(this,c),this.requestUpdate(n,h,r,!0,c)}}throw Error("Unsupported decorator location: "+o)};function m(r){return(t,e)=>typeof e=="object"?pa(r,t,e):((o,i,s)=>{let n=i.hasOwnProperty(s);return i.constructor.createProperty(s,o),n?Object.getOwnPropertyDescriptor(i,s):void 0})(r,t,e)}function K(r){return m({...r,state:!0,attribute:!1})}var Wt=(r,t,e)=>(e.configurable=!0,e.enumerable=!0,Reflect.decorate&&typeof t!="object"&&Object.defineProperty(r,t,e),e);function Q(r,t){return(e,o,i)=>{let s=n=>n.renderRoot?.querySelector(r)??null;if(t){let{get:n,set:c}=typeof o=="object"?e:i??(()=>{let h=Symbol();return{get(){return this[h]},set(g){this[h]=g}}})();return Wt(e,o,{get(){let h=n.call(this);return h===void 0&&(h=s(this),(h!==null||this.hasUpdated)&&c.call(this,h)),h}})}return Wt(e,o,{get(){return s(this)}})}}var Pt=class extends Event{constructor(t,e,o,i){super("context-request",{bubbles:!0,composed:!0}),this.context=t,this.contextTarget=e,this.callback=o,this.subscribe=i??!1}};var se=class{constructor(t,e,o,i){if(this.subscribe=!1,this.provided=!1,this.value=void 0,this.t=(s,n)=>{this.unsubscribe&&(this.unsubscribe!==n&&(this.provided=!1,this.unsubscribe()),this.subscribe||this.unsubscribe()),this.value=s,this.host.requestUpdate(),this.provided&&!this.subscribe||(this.provided=!0,this.callback&&this.callback(s,n)),this.unsubscribe=n},this.host=t,e.context!==void 0){let s=e;this.context=s.context,this.callback=s.callback,this.subscribe=s.subscribe??!1}else this.context=e,this.callback=o,this.subscribe=i??!1;this.host.addController(this)}hostConnected(){this.dispatchRequest()}hostDisconnected(){this.unsubscribe&&(this.unsubscribe(),this.unsubscribe=void 0)}dispatchRequest(){this.host.dispatchEvent(new Pt(this.context,this.host,this.t,this.subscribe))}};var hr=class{get value(){return this.o}set value(t){this.setValue(t)}setValue(t,e=!1){let o=e||!Object.is(t,this.o);this.o=t,o&&this.updateObservers()}constructor(t){this.subscriptions=new Map,this.updateObservers=()=>{for(let[e,{disposer:o}]of this.subscriptions)e(this.o,o)},t!==void 0&&(this.value=t)}addCallback(t,e,o){if(!o)return void t(this.value);this.subscriptions.has(t)||this.subscriptions.set(t,{disposer:()=>{this.subscriptions.delete(t)},consumerHost:e});let{disposer:i}=this.subscriptions.get(t);t(this.value,i)}clearCallbacks(){this.subscriptions.clear()}};var Xr=class extends Event{constructor(t,e){super("context-provider",{bubbles:!0,composed:!0}),this.context=t,this.contextTarget=e}},ne=class extends hr{constructor(t,e,o){super(e.context!==void 0?e.initialValue:o),this.onContextRequest=i=>{if(i.context!==this.context)return;let s=i.contextTarget??i.composedPath()[0];s!==this.host&&(i.stopPropagation(),this.addCallback(i.callback,s,i.subscribe))},this.onProviderRequest=i=>{if(i.context!==this.context||(i.contextTarget??i.composedPath()[0])===this.host)return;let s=new Set;for(let[n,{consumerHost:c}]of this.subscriptions)s.has(n)||(s.add(n),c.dispatchEvent(new Pt(this.context,c,n,!0)));i.stopPropagation()},this.host=t,e.context!==void 0?this.context=e.context:this.context=e,this.attachListeners(),this.host.addController?.(this)}attachListeners(){this.host.addEventListener("context-request",this.onContextRequest),this.host.addEventListener("context-provider",this.onProviderRequest)}hostConnected(){this.host.dispatchEvent(new Xr(this.context,this.host))}};function Qr({context:r}){return(t,e)=>{let o=new WeakMap;if(typeof e=="object")return{get(){return t.get.call(this)},set(i){return o.get(this).setValue(i),t.set.call(this,i)},init(i){return o.set(this,new ne(this,{context:r,initialValue:i})),i}};{t.constructor.addInitializer(n=>{o.set(n,new ne(n,{context:r}))});let i=Object.getOwnPropertyDescriptor(t,e),s;if(i===void 0){let n=new WeakMap;s={get(){return n.get(this)},set(c){o.get(this).setValue(c),n.set(this,c)},configurable:!0,enumerable:!0}}else{let n=i.set;s={...i,set(c){o.get(this).setValue(c),n?.call(this,c)}}}return void Object.defineProperty(t,e,s)}}}function Jr({context:r,subscribe:t}){return(e,o)=>{typeof o=="object"?o.addInitializer(function(){new se(this,{context:r,callback:i=>{e.set.call(this,i)},subscribe:t})}):e.constructor.addInitializer(i=>{new se(i,{context:r,callback:s=>{i[o]=s},subscribe:t})})}}var Te="dashboard-context";var to=globalThis.location?.origin,Mt=to!==void 0&&to.length>0?to:"http://backend:8080",eo=[500,1e3,2e3,4e3,8e3];function ze(r){return new Date(r).toLocaleString("en-US",{year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"})}function ni(r){return new Promise(t=>{globalThis.setTimeout(t,r)})}var Oe=class{#t;#r=null;#o=null;#i=!1;constructor(t){this.#t=t}connect(t){this.disconnect(),this.#r=t,this.#i=!1,this.#s()}disconnect(){this.#i=!0,this.#o!==null&&(this.#o.close(),this.#o=null)}async#s(){if(this.#r===null)return;let t=0;for(;!this.#i;){let e=`${Mt.replace("http","ws")}/v1/rooms/${this.#r}/stream`,o=new WebSocket(e);if(this.#o=o,!await this.#a(o)){t+=1,this.#t.onDisconnected(t),await this.#h(t);continue}t=0,this.#t.onConnected();let s=await this.#u(o);if(this.#i||s!==null&&s.code===1e3)return;t+=1,this.#t.onDisconnected(t),await this.#h(t)}}#a(t){return new Promise(e=>{t.onopen=()=>e(!0),t.onerror=()=>e(!1),t.onclose=()=>e(!1)})}#u(t){return new Promise(e=>{t.onmessage=o=>{try{let i=JSON.parse(o.data);this.#t.onEvent(i)}catch{this.#t.onError("Failed to parse event payload.")}},t.onerror=()=>{this.#t.onError("WebSocket connection error.")},t.onclose=o=>{e(o)}})}async#h(t){let e=Math.min(t-1,eo.length-1),o=eo[e]??8e3;await ni(o)}};var ma={rooms:[],currentRoomId:null,views:{},wsConnected:!1,reconnectAttempt:0,errorMessage:null,isCreatingRoom:!1},Pe=class{#t=ma;#r=new Set;#o;constructor(){this.#o=new Oe({onConnected:()=>{this.#e({wsConnected:!0,reconnectAttempt:0})},onDisconnected:t=>{this.#e({wsConnected:!1,reconnectAttempt:t})},onEvent:t=>{this.#s(t)},onError:t=>{this.#e({errorMessage:t})}}),this.loadRooms()}subscribe(t){return this.#r.add(t),()=>{this.#r.delete(t)}}getState(){return this.#t}dispose(){this.#o.disconnect(),this.#r.clear()}async loadRooms(){try{let t=await fetch(`${Mt}/v1/rooms`);if(!t.ok){this.#e({errorMessage:"Failed to load rooms."});return}let e=await t.json();this.#e({rooms:e.rooms}),this.#t.currentRoomId===null&&e.rooms.length>0&&this.selectRoom(e.rooms[0].id)}catch{this.#e({errorMessage:"Network error while loading rooms."})}}selectRoom(t){this.#t.currentRoomId!==t&&(this.#e({currentRoomId:t,wsConnected:!1,reconnectAttempt:0,errorMessage:null}),this.#o.connect(t))}async createRoom(t){this.#e({isCreatingRoom:!0,errorMessage:null});try{let e=await fetch(`${Mt}/v1/rooms`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)});if(!e.ok){let i=await e.text();return this.#e({isCreatingRoom:!1,errorMessage:`Create failed: ${i}`}),null}let o=await e.json();return this.#e({isCreatingRoom:!1}),await this.loadRooms(),this.selectRoom(o.room.id),o.room}catch{return this.#e({isCreatingRoom:!1,errorMessage:"Network error while creating room."}),null}}async updateRoom(t,e){try{let o=await fetch(`${Mt}/v1/rooms/${t}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)});if(!o.ok){let s=await o.text();this.#e({errorMessage:`Update failed: ${s}`});return}let i=await o.json();this.#u(i.room)}catch{this.#e({errorMessage:"Network error while updating room."})}}async pauseRoom(t){await this.#i(t,"pause")}async resumeRoom(t){await this.#i(t,"resume")}async deleteRoom(t){try{await fetch(`${Mt}/v1/rooms/${t}`,{method:"DELETE"});let e=this.#t.rooms.filter(s=>s.id!==t),o=e[0]?.id??null,i={...this.#t.views};delete i[t],this.#e({rooms:e,currentRoomId:o,views:i}),o!==null?this.#o.connect(o):this.#o.disconnect()}catch{this.#e({errorMessage:"Failed to delete room."})}}async#i(t,e){try{if(!(await fetch(`${Mt}/v1/rooms/${t}/${e}`,{method:"POST"})).ok){this.#e({errorMessage:`${e} failed.`});return}}catch{this.#e({errorMessage:`Network error during ${e}.`})}}#s(t){switch(t.type){case"snapshot":this.#a(t.room,t.events,t.reports);break;case"roomStatus":this.#h(e=>({...e,status:t.status}));break;case"turnStarted":this.#n(e=>xa(e,{turnId:t.turnId,agent:t.agent,kind:t.kind,content:"",status:"streaming",sequence:null,timestamp:null,error:null}));break;case"turnToken":this.#n(e=>ro(e,t.turnId,o=>({...o,content:o.content+t.delta})));break;case"turnCompleted":this.#n(e=>ro(e,t.turnId,o=>({...o,content:t.content,status:"completed",sequence:t.sequence,timestamp:t.timestamp})));break;case"turnFailed":this.#n(e=>ro(e,t.turnId,o=>({...o,content:t.partial,status:"failed",error:t.error})));break;case"toolStarted":this.#n(e=>li(e,{id:`live:${t.turnId}:${t.tool}:${e.toolCalls.length}`,turnId:t.turnId,sequence:null,tool:t.tool,argsPreview:t.argsPreview,status:"running",outputPreview:null,durationMs:null,timestamp:null}));break;case"toolCompleted":this.#n(e=>Ca(e,t));break;case"reportStarted":this.#n(e=>_a(e,{reportId:t.reportId,sequence:t.sequence,content:"",status:"streaming",completedAt:null}));break;case"reportToken":this.#n(e=>ai(e,t.reportId,o=>({...o,content:o.content+t.delta})));break;case"reportCompleted":this.#n(e=>ai(e,t.reportId,o=>({...o,content:t.content,status:t.status,completedAt:t.completedAt})));break}}#a(t,e,o){let i=[],s=[];for(let c of e)ga(c,i,s);let n={room:t,turns:i,toolCalls:s,reports:o.map(ka)};this.#e({views:{...this.#t.views,[t.id]:n}}),this.#u(t)}#u(t){let e=this.#t.rooms.some(s=>s.id===t.id)?this.#t.rooms.map(s=>s.id===t.id?t:s):[t,...this.#t.rooms],o=this.#t.views[t.id],i=o!==void 0?{...this.#t.views,[t.id]:{...o,room:t}}:this.#t.views;this.#e({rooms:e,views:i})}#h(t){let e=this.#t.currentRoomId;if(e===null)return;let o=this.#t.rooms.find(i=>i.id===e);o!==void 0&&this.#u(t(o))}#n(t){let e=this.#t.currentRoomId;if(e===null)return;let o=this.#t.views[e];if(o===void 0)return;let i=t(o);this.#e({views:{...this.#t.views,[e]:i}})}#e(t){this.#t={...this.#t,...t};for(let e of this.#r)e()}};function ga(r,t,e){if(r.kind==="tool_call"){let o=va(r.content);o!==null&&e.push({id:`${r.sequence}`,turnId:"",sequence:r.sequence,tool:o.tool,argsPreview:ya(o.args),status:o.ok?"ok":"error",outputPreview:o.outputPreview,durationMs:o.durationMs,timestamp:r.timestamp});return}(r.kind==="agent_chat"||r.kind==="leader_note"||r.kind==="system"||r.kind==="phase")&&t.push(ba(r))}function ba(r){let t=r.kind==="leader_note"?"leader_note":"agent_chat";return{turnId:`history:${r.sequence}`,agent:r.agent??wa(r.kind),kind:t,content:r.content,status:"completed",sequence:r.sequence,timestamp:r.timestamp,error:null}}function wa(r){switch(r){case"agent_chat":return"agent";case"leader_note":return"leader";case"phase":return"phase";case"system":return"system";case"tool_call":return"tool"}}function va(r){try{return JSON.parse(r)}catch{return null}}function ya(r){try{let t=JSON.stringify(r);return t===void 0?"":t.length>240?`${t.slice(0,240)}...`:t}catch{return""}}function xa(r,t){let e=r.turns.findIndex(i=>i.turnId===t.turnId),o=e>=0?r.turns.map((i,s)=>s===e?t:i):[...r.turns,t];return{...r,turns:o}}function ro(r,t,e){let o=r.turns.map(i=>i.turnId===t?e(i):i);return{...r,turns:o}}function li(r,t){return{...r,toolCalls:[...r.toolCalls,t]}}function Ca(r,t){let e=r.toolCalls.findIndex(s=>s.status==="running"&&s.turnId===t.turnId&&s.tool===t.tool);if(e<0)return li(r,{id:`${t.sequence}`,turnId:t.turnId,sequence:t.sequence,tool:t.tool,argsPreview:"",status:t.ok?"ok":"error",outputPreview:t.outputPreview,durationMs:t.durationMs,timestamp:t.timestamp});let o={...r.toolCalls[e],id:`${t.sequence}`,sequence:t.sequence,status:t.ok?"ok":"error",outputPreview:t.outputPreview,durationMs:t.durationMs,timestamp:t.timestamp},i=r.toolCalls.map((s,n)=>n===e?o:s);return{...r,toolCalls:i}}function _a(r,t){let e=r.reports.findIndex(i=>i.reportId===t.reportId),o=e>=0?r.reports.map((i,s)=>s===e?t:i):[...r.reports,t];return{...r,reports:o}}function ai(r,t,e){let o=r.reports.map(i=>i.reportId===t?e(i):i);return{...r,reports:o}}function ka(r){return{reportId:`${r.id}`,sequence:r.sequence,content:r.content,status:r.status,completedAt:r.completedAt}}function Sa(){function r(l,a){return function(d){e(a,"addInitializer"),o(d,"An initializer"),l.push(d)}}function t(l,a,p,d,u,C,_,k,E){var y;switch(u){case 1:y="accessor";break;case 2:y="method";break;case 3:y="getter";break;case 4:y="setter";break;default:y="field"}var w={kind:y,name:_?"#"+a:a,static:C,private:_,metadata:k},x={v:!1};w.addInitializer=r(d,x);var b,v;u===0?_?(b=p.get,v=p.set):(b=function(){return this[a]},v=function($){this[a]=$}):u===2?b=function(){return p.value}:((u===1||u===3)&&(b=function(){return p.get.call(this)}),(u===1||u===4)&&(v=function($){p.set.call(this,$)})),w.access=b&&v?{get:b,set:v}:b?{get:b}:{set:v};try{return l(E,w)}finally{x.v=!0}}function e(l,a){if(l.v)throw new Error("attempted to call "+a+" after decoration was finished")}function o(l,a){if(typeof l!="function")throw new TypeError(a+" must be a function")}function i(l,a){var p=typeof a;if(l===1){if(p!=="object"||a===null)throw new TypeError("accessor decorators must return an object with get, set, or init properties or void 0");a.get!==void 0&&o(a.get,"accessor.get"),a.set!==void 0&&o(a.set,"accessor.set"),a.init!==void 0&&o(a.init,"accessor.init")}else if(p!=="function"){var d;throw l===0?d="field":l===10?d="class":d="method",new TypeError(d+" decorators must return a function or void 0")}}function s(l,a,p,d,u,C,_,k,E){var y=p[0],w,x,b;_?u===0||u===1?w={get:p[3],set:p[4]}:u===3?w={get:p[3]}:u===4?w={set:p[3]}:w={value:p[3]}:u!==0&&(w=Object.getOwnPropertyDescriptor(a,d)),u===1?b={get:w.get,set:w.set}:u===2?b=w.value:u===3?b=w.get:u===4&&(b=w.set);var v,$,R;if(typeof y=="function")v=t(y,d,w,k,u,C,_,E,b),v!==void 0&&(i(u,v),u===0?x=v:u===1?(x=v.init,$=v.get||b.get,R=v.set||b.set,b={get:$,set:R}):b=v);else for(var T=y.length-1;T>=0;T--){var I=y[T];if(v=t(I,d,w,k,u,C,_,E,b),v!==void 0){i(u,v);var P;u===0?P=v:u===1?(P=v.init,$=v.get||b.get,R=v.set||b.set,b={get:$,set:R}):b=v,P!==void 0&&(x===void 0?x=P:typeof x=="function"?x=[x,P]:x.push(P))}}if(u===0||u===1){if(x===void 0)x=function(L,A){return A};else if(typeof x!="function"){var X=x;x=function(L,A){for(var H=A,W=0;W<X.length;W++)H=X[W].call(L,H);return H}}else{var G=x;x=function(L,A){return G.call(L,A)}}l.push(x)}u!==0&&(u===1?(w.get=b.get,w.set=b.set):u===2?w.value=b:u===3?w.get=b:u===4&&(w.set=b),_?u===1?(l.push(function(L,A){return b.get.call(L,A)}),l.push(function(L,A){return b.set.call(L,A)})):u===2?l.push(b):l.push(function(L,A){return b.call(L,A)}):Object.defineProperty(a,d,w))}function n(l,a,p){for(var d=[],u,C,_=new Map,k=new Map,E=0;E<a.length;E++){var y=a[E];if(Array.isArray(y)){var w=y[1],x=y[2],b=y.length>3,v=w>=5,$,R;if(v?($=l,w=w-5,C=C||[],R=C):($=l.prototype,u=u||[],R=u),w!==0&&!b){var T=v?k:_,I=T.get(x)||0;if(I===!0||I===3&&w!==4||I===4&&w!==3)throw new Error("Attempted to decorate a public method/accessor that has the same name as a previously decorated public method/accessor. This is not currently supported by the decorators plugin. Property name was: "+x);!I&&w>2?T.set(x,w):T.set(x,!0)}s(d,$,y,x,w,v,b,R,p)}}return c(d,u),c(d,C),d}function c(l,a){a&&l.push(function(p){for(var d=0;d<a.length;d++)a[d].call(p);return p})}function h(l,a,p){if(a.length>0){for(var d=[],u=l,C=l.name,_=a.length-1;_>=0;_--){var k={v:!1};try{var E=a[_](u,{kind:"class",name:C,addInitializer:r(d,k),metadata:p})}finally{k.v=!0}E!==void 0&&(i(10,E),u=E)}return[g(u,p),function(){for(var y=0;y<d.length;y++)d[y].call(u)}]}}function g(l,a){return Object.defineProperty(l,Symbol.metadata||Symbol.for("Symbol.metadata"),{configurable:!0,enumerable:!0,value:a})}return function(a,p,d,u){if(u!==void 0)var C=u[Symbol.metadata||Symbol.for("Symbol.metadata")];var _=Object.create(C===void 0?null:C),k=n(a,p,_);return d.length||g(a,_),{e:k,get c(){return h(a,d,_)}}}}function fi(r,t,e,o){return(fi=Sa())(r,t,e,o)}var mi,ci,ui,gi,bi,hi,di,Ea;mi=B("te-dashboard-provider"),gi=Qr({context:Te}),bi=m({attribute:!1});var pi=class extends(ui=it){static{({e:[hi,di],c:[Ea,ci]}=fi(this,[[[gi,bi],1,"store"]],[mi],ui))}#t=(di(this),hi(this,new Pe));get store(){return this.#t}set store(t){this.#t=t}disconnectedCallback(){this.store.dispose(),super.disconnectedCallback()}render(){return S`
      <slot></slot>
    `}static{ci()}};var ft={ATTRIBUTE:1,CHILD:2,PROPERTY:3,BOOLEAN_ATTRIBUTE:4,EVENT:5,ELEMENT:6},ae=r=>(...t)=>({_$litDirective$:r,values:t}),It=class{constructor(t){}get _$AU(){return this._$AM._$AU}_$AT(t,e,o){this._$Ct=t,this._$AM=e,this._$Ci=o}_$AS(t,e){return this.update(t,e)}update(t,e){return this.render(...e)}};var Me=class extends It{constructor(t){if(super(t),this.it=Y,t.type!==ft.CHILD)throw Error(this.constructor.directiveName+"() can only be used in child bindings")}render(t){if(t===Y||t==null)return this._t=void 0,this.it=t;if(t===ot)return t;if(typeof t!="string")throw Error(this.constructor.directiveName+"() called with a non-string value");if(t===this.it)return this._t;this.it=t;let e=[t];return e.raw=e,this._t={_$litType$:this.constructor.resultType,strings:e,values:[]}}};Me.directiveName="unsafeHTML",Me.resultType=1;var dr=ae(Me);function $a(){function r(l,a){return function(d){e(a,"addInitializer"),o(d,"An initializer"),l.push(d)}}function t(l,a,p,d,u,C,_,k,E){var y;switch(u){case 1:y="accessor";break;case 2:y="method";break;case 3:y="getter";break;case 4:y="setter";break;default:y="field"}var w={kind:y,name:_?"#"+a:a,static:C,private:_,metadata:k},x={v:!1};w.addInitializer=r(d,x);var b,v;u===0?_?(b=p.get,v=p.set):(b=function(){return this[a]},v=function($){this[a]=$}):u===2?b=function(){return p.value}:((u===1||u===3)&&(b=function(){return p.get.call(this)}),(u===1||u===4)&&(v=function($){p.set.call(this,$)})),w.access=b&&v?{get:b,set:v}:b?{get:b}:{set:v};try{return l(E,w)}finally{x.v=!0}}function e(l,a){if(l.v)throw new Error("attempted to call "+a+" after decoration was finished")}function o(l,a){if(typeof l!="function")throw new TypeError(a+" must be a function")}function i(l,a){var p=typeof a;if(l===1){if(p!=="object"||a===null)throw new TypeError("accessor decorators must return an object with get, set, or init properties or void 0");a.get!==void 0&&o(a.get,"accessor.get"),a.set!==void 0&&o(a.set,"accessor.set"),a.init!==void 0&&o(a.init,"accessor.init")}else if(p!=="function"){var d;throw l===0?d="field":l===10?d="class":d="method",new TypeError(d+" decorators must return a function or void 0")}}function s(l,a,p,d,u,C,_,k,E){var y=p[0],w,x,b;_?u===0||u===1?w={get:p[3],set:p[4]}:u===3?w={get:p[3]}:u===4?w={set:p[3]}:w={value:p[3]}:u!==0&&(w=Object.getOwnPropertyDescriptor(a,d)),u===1?b={get:w.get,set:w.set}:u===2?b=w.value:u===3?b=w.get:u===4&&(b=w.set);var v,$,R;if(typeof y=="function")v=t(y,d,w,k,u,C,_,E,b),v!==void 0&&(i(u,v),u===0?x=v:u===1?(x=v.init,$=v.get||b.get,R=v.set||b.set,b={get:$,set:R}):b=v);else for(var T=y.length-1;T>=0;T--){var I=y[T];if(v=t(I,d,w,k,u,C,_,E,b),v!==void 0){i(u,v);var P;u===0?P=v:u===1?(P=v.init,$=v.get||b.get,R=v.set||b.set,b={get:$,set:R}):b=v,P!==void 0&&(x===void 0?x=P:typeof x=="function"?x=[x,P]:x.push(P))}}if(u===0||u===1){if(x===void 0)x=function(L,A){return A};else if(typeof x!="function"){var X=x;x=function(L,A){for(var H=A,W=0;W<X.length;W++)H=X[W].call(L,H);return H}}else{var G=x;x=function(L,A){return G.call(L,A)}}l.push(x)}u!==0&&(u===1?(w.get=b.get,w.set=b.set):u===2?w.value=b:u===3?w.get=b:u===4&&(w.set=b),_?u===1?(l.push(function(L,A){return b.get.call(L,A)}),l.push(function(L,A){return b.set.call(L,A)})):u===2?l.push(b):l.push(function(L,A){return b.call(L,A)}):Object.defineProperty(a,d,w))}function n(l,a,p){for(var d=[],u,C,_=new Map,k=new Map,E=0;E<a.length;E++){var y=a[E];if(Array.isArray(y)){var w=y[1],x=y[2],b=y.length>3,v=w>=5,$,R;if(v?($=l,w=w-5,C=C||[],R=C):($=l.prototype,u=u||[],R=u),w!==0&&!b){var T=v?k:_,I=T.get(x)||0;if(I===!0||I===3&&w!==4||I===4&&w!==3)throw new Error("Attempted to decorate a public method/accessor that has the same name as a previously decorated public method/accessor. This is not currently supported by the decorators plugin. Property name was: "+x);!I&&w>2?T.set(x,w):T.set(x,!0)}s(d,$,y,x,w,v,b,R,p)}}return c(d,u),c(d,C),d}function c(l,a){a&&l.push(function(p){for(var d=0;d<a.length;d++)a[d].call(p);return p})}function h(l,a,p){if(a.length>0){for(var d=[],u=l,C=l.name,_=a.length-1;_>=0;_--){var k={v:!1};try{var E=a[_](u,{kind:"class",name:C,addInitializer:r(d,k),metadata:p})}finally{k.v=!0}E!==void 0&&(i(10,E),u=E)}return[g(u,p),function(){for(var y=0;y<d.length;y++)d[y].call(u)}]}}function g(l,a){return Object.defineProperty(l,Symbol.metadata||Symbol.for("Symbol.metadata"),{configurable:!0,enumerable:!0,value:a})}return function(a,p,d,u){if(u!==void 0)var C=u[Symbol.metadata||Symbol.for("Symbol.metadata")];var _=Object.create(C===void 0?null:C),k=n(a,p,_);return d.length||g(a,_),{e:k,get c(){return h(a,d,_)}}}}function Li(r,t,e,o){return(Li=$a())(r,t,e,o)}function Aa(r){return r}var Ri,wi,vi,Ti,zi,Oi,Pi,Mi,yi,xi,Ci,_i,ki,Si;function pr(r){if(!(r instanceof HTMLElement)||!("value"in r))return"";let t=r.value;return typeof t=="string"?t:""}function Ei(r){let t=r.replace(/<\/script/gi,"<\\/script");return dr(`<script type="text/markdown">${t}<\/script>`)}var $i;Ri=B("te-room-detail"),Ti=m({attribute:!1}),zi=K(),Oi=K(),Pi=K(),Mi=K();new class extends Aa{constructor(){super($i),wi()}static{class r extends(vi=it){static{({e:[yi,xi,Ci,_i,ki,Si],c:[$i,wi]}=Li(this,[[Ti,1,"store"],[zi,1,"dashboardState"],[Oi,1,"activeTab"],[Pi,1,"settingsForm"],[Mi,1,"settingsRoomId"]],[Ri],vi))}#t=(Si(this),yi(this));get store(){return this.#t}set store(e){this.#t=e}#r=xi(this,null);get dashboardState(){return this.#r}set dashboardState(e){this.#r=e}#o=Ci(this,"stream");get activeTab(){return this.#o}set activeTab(e){this.#o=e}#i=_i(this,null);get settingsForm(){return this.#i}set settingsForm(e){this.#i=e}#s=ki(this,null);get settingsRoomId(){return this.#s}set settingsRoomId(e){this.#s=e}#a=null;static styles=z`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      background: var(--wa-color-surface-sunken);
    }

    .empty {
      padding: 2rem;
      text-align: center;
      color: var(--wa-color-text-quiet);
    }

    .room-header {
      padding: 0.7rem 1.25rem;
      border-bottom: var(--wa-border-width-s) solid var(--wa-color-border-normal);
      display: flex;
      align-items: center;
      gap: 0.6rem;
      background: var(--wa-color-surface-default);
      flex-shrink: 0;
    }

    .room-name {
      font-weight: 600;
      font-size: 1rem;
    }

    .room-topic {
      color: var(--wa-color-text-quiet);
      font-size: 0.85rem;
    }

    .room-actions {
      margin-left: auto;
      display: flex;
      gap: 0.4rem;
      align-items: center;
    }

    .tab-bar {
      display: flex;
      gap: 0.4rem;
      padding: 0.4rem 1rem;
      border-bottom: var(--wa-border-width-s) solid var(--wa-color-border-normal);
      background: var(--wa-color-surface-default);
      flex-shrink: 0;
    }

    .tab-btn {
      background: none;
      border: var(--wa-border-width-s) solid transparent;
      padding: 0.35rem 0.75rem;
      border-radius: 0.4rem;
      cursor: pointer;
      font: inherit;
      font-size: 0.85rem;
      color: var(--wa-color-text-quiet);
    }

    .tab-btn.is-active {
      background: var(--wa-color-brand-fill-quiet);
      border-color: var(--wa-color-brand-border-normal);
      color: var(--wa-color-brand-on-quiet);
    }

    .panel {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 1rem 1.25rem;
    }

    .turn-list {
      display: grid;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .turn-item {
      width: min(100%, 44rem);
    }

    .turn-meta {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      font-size: 0.72rem;
      color: var(--wa-color-text-quiet);
      margin-bottom: 0.3rem;
    }

    .turn-leader wa-card::part(base) {
      border-color: var(--wa-color-brand-border-normal);
      background: var(--wa-color-brand-fill-quiet);
    }

    .turn-streaming wa-card::part(base) {
      border-style: dashed;
    }

    .turn-failed wa-card::part(base) {
      border-color: var(--wa-color-danger-border-normal);
      background: var(--wa-color-danger-fill-quiet);
    }

    .tool-list {
      display: grid;
      gap: 0.4rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .tool-meta {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      font-size: 0.72rem;
      color: var(--wa-color-text-quiet);
    }

    .tool-args {
      font-family: var(--wa-font-family-code, monospace);
      font-size: 0.75rem;
      color: var(--wa-color-text-quiet);
      white-space: pre-wrap;
      word-break: break-all;
    }

    .tool-output {
      font-family: var(--wa-font-family-code, monospace);
      font-size: 0.78rem;
      white-space: pre-wrap;
    }

    .form-grid {
      display: grid;
      gap: 0.6rem;
      max-width: 48rem;
    }

    .form-field {
      display: grid;
      gap: 0.25rem;
    }

    .form-label {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--wa-color-text-quiet);
    }

    .number-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
      gap: 0.6rem;
    }

    .provider-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.6rem;
    }

    fieldset.tier {
      border: var(--wa-border-width-s) solid var(--wa-color-border-normal);
      border-radius: 0.5rem;
      padding: 0.6rem;
      display: grid;
      gap: 0.4rem;
    }

    fieldset.tier legend {
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0 0.3rem;
    }

    .save-row {
      display: flex;
      justify-content: flex-end;
      gap: 0.4rem;
      margin-top: 0.5rem;
    }

    .report-list {
      display: grid;
      gap: 0.6rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .report-item wa-card::part(base) {
      padding: 0.7rem 0.85rem;
    }
  `;connectedCallback(){super.connectedCallback(),this.#y()}updated(e){e.has("store")&&(this.#a?.(),this.#a=null,this.#y())}disconnectedCallback(){this.#a?.(),this.#a=null,super.disconnectedCallback()}render(){let e=this.#k();return e===null?S`
        <p class="empty">
          Select a room from the sidebar, or create a new one.
        </p>
      `:S`
      ${this.#u(e.room)} ${this.#h()}
      <div class="panel">${this.#n(e)}</div>
    `}#u(e){let o=e.status==="paused";return S`
      <header class="room-header">
        <span class="room-name">${e.name}</span>
        <span class="room-topic">- ${e.topic}</span>
        <wa-badge variant="${Ra(e.status)}" size="small">
          ${e.status}
        </wa-badge>
        <div class="room-actions">
          ${o?S`
              <wa-button size="small" variant="brand" @click="${()=>this.store.resumeRoom(e.id)}">Resume</wa-button>
            `:S`
              <wa-button size="small" variant="neutral" @click="${()=>this.store.pauseRoom(e.id)}">Pause</wa-button>
            `}
          <wa-button size="small" variant="danger" @click="${()=>this.#C(e.id)}"
          >Delete</wa-button>
        </div>
      </header>
    `}#h(){return S`
      <div class="tab-bar">
        ${["stream","settings","reports"].map(o=>S`
            <button
              class="tab-btn ${this.activeTab===o?"is-active":""}"
              @click="${()=>this.#v(o)}"
            >
              ${La(o)}
            </button>
          `)}
      </div>
    `}#n(e){switch(this.activeTab){case"stream":return this.#e(e);case"settings":return this.#g(e);case"reports":return this.#w(e)}}#e(e){return e.turns.length===0?S`
        <p class="empty">No turns yet.</p>
      `:S`
      <ul class="turn-list">
        ${e.turns.map(o=>this.#d(o))} ${e.toolCalls.length>0?this.#m(e):""}
      </ul>
    `}#d(e){let o=["turn-item",e.kind==="leader_note"?"turn-leader":"",e.status==="streaming"?"turn-streaming":"",e.status==="failed"?"turn-failed":""].filter(Boolean).join(" ");return S`
      <li class="${o}">
        <wa-card>
          <div class="turn-meta">
            <strong>${e.agent}</strong>
            <span>- ${e.kind==="leader_note"?"leader note":"chat"}</span>
            ${e.timestamp?S`
                <span>- ${ze(e.timestamp)}</span>
              `:""} ${e.status==="streaming"?S`
                <wa-badge size="small" variant="warning">streaming</wa-badge>
              `:""} ${e.status==="failed"?S`
                <wa-badge size="small" variant="danger">failed</wa-badge>
              `:""}
          </div>
          <wa-markdown>${Ei(e.content||"...")}</wa-markdown>
          ${e.error?S`
              <p class="tool-output">${e.error}</p>
            `:""}
        </wa-card>
      </li>
    `}#m(e){return S`
      <li>
        <h3 class="form-label">Tool calls</h3>
        <ul class="tool-list">
          ${e.toolCalls.map(o=>S`
              <li>
                <wa-card>
                  <div class="tool-meta">
                    <strong>${o.tool}</strong>
                    ${o.status==="running"?S`
                        <wa-badge size="small" variant="warning">running</wa-badge>
                      `:o.status==="ok"?S`
                        <wa-badge size="small" variant="success">ok</wa-badge>
                      `:S`
                        <wa-badge size="small" variant="danger">error</wa-badge>
                      `} ${o.durationMs!==null?S`
                        <span>${o.durationMs} ms</span>
                      `:""}
                  </div>
                  ${o.argsPreview!==""?S`
                      <pre class="tool-args">${o.argsPreview}</pre>
                    `:""} ${o.outputPreview!==null?S`
                      <pre class="tool-output">${o.outputPreview}</pre>
                    `:""}
                </wa-card>
              </li>
            `)}
        </ul>
      </li>
    `}#g(e){(this.settingsForm===null||this.settingsRoomId!==e.room.id)&&(this.settingsForm=Ai(e.room),this.settingsRoomId=e.room.id);let o=this.settingsForm;return S`
      <div class="form-grid">
        ${this.#p("Topic",o.topic,i=>this.#l({topic:i}))} ${this.#p("Goal",o.goal,i=>this.#l({goal:i}))} ${this.#b("Instruction",o.instruction,i=>this.#l({instruction:i}))} ${this.#b("Background",o.background,i=>this.#l({background:i}))}
        <div class="number-row">
          ${this.#f("Chat interval (sec)",o.chatIntervalSeconds,i=>this.#l({chatIntervalSeconds:i}))} ${this.#f("Eval interval (sec)",o.evaluationIntervalSeconds,i=>this.#l({evaluationIntervalSeconds:i}))} ${this.#f("Report interval (sec)",o.reportIntervalSeconds,i=>this.#l({reportIntervalSeconds:i}))} ${this.#f("Python timeout (sec)",o.pythonTimeoutSeconds,i=>this.#l({pythonTimeoutSeconds:i}))} ${this.#f("Python feedback every",o.pythonFeedbackEvery,i=>this.#l({pythonFeedbackEvery:i}))}
        </div>
        <div class="provider-grid">
          ${this.#c("Low tier",o.low,i=>this.#l({low:i}))} ${this.#c("High tier",o.high,i=>this.#l({high:i}))}
        </div>
        <div class="save-row">
          <wa-button size="small" variant="neutral" @click="${()=>this.#_(e.room)}"
          >Reset</wa-button>
          <wa-button size="small" variant="brand" @click="${()=>this.#x(e.room.id)}"
          >Save</wa-button>
        </div>
      </div>
    `}#w(e){if(e.reports.length===0)return S`
        <p class="empty">No reports yet.</p>
      `;let o=[...e.reports].sort((i,s)=>s.sequence-i.sequence);return S`
      <ul class="report-list">
        ${o.map(i=>S`
            <li class="report-item">
              <wa-card>
                <div class="turn-meta">
                  <strong>Report #${i.sequence}</strong>
                  ${i.status==="streaming"?S`
                      <wa-badge size="small" variant="warning">streaming</wa-badge>
                    `:i.status==="failed"?S`
                      <wa-badge size="small" variant="danger">failed</wa-badge>
                    `:S`
                      <wa-badge size="small" variant="success">done</wa-badge>
                    `} ${i.completedAt?S`
                      <span>- ${ze(i.completedAt)}</span>
                    `:""}
                </div>
                <wa-markdown>${Ei(i.content||"...")}</wa-markdown>
              </wa-card>
            </li>
          `)}
      </ul>
    `}#p(e,o,i){return S`
      <label class="form-field">
        <span class="form-label">${e}</span>
        <wa-input size="small" .value="${o}" @input="${s=>i(pr(s.target))}"></wa-input>
      </label>
    `}#b(e,o,i){return S`
      <label class="form-field">
        <span class="form-label">${e}</span>
        <wa-textarea
          size="small"
          rows="3"
          .value="${o}"
          @input="${s=>i(pr(s.target))}"
        ></wa-textarea>
      </label>
    `}#f(e,o,i){return S`
      <label class="form-field">
        <span class="form-label">${e}</span>
        <wa-input
          type="number"
          size="small"
          min="1"
          .value="${String(o)}"
          @input="${s=>{let n=Number.parseInt(pr(s.target),10);Number.isFinite(n)&&i(Math.max(1,n))}}"
        ></wa-input>
      </label>
    `}#c(e,o,i){return S`
      <fieldset class="tier">
        <legend>${e}</legend>
        <label class="form-field">
          <span class="form-label">Provider</span>
          <wa-select size="small" .value="${o.provider}" @change="${s=>{let n=pr(s.target);(n==="ollama"||n==="openrouter"||n==="openai_compat")&&i({...o,provider:n})}}">
            <wa-option value="ollama">Ollama</wa-option>
            <wa-option value="openrouter">OpenRouter</wa-option>
            <wa-option value="openai_compat">OpenAI-compat</wa-option>
          </wa-select>
        </label>
        ${this.#p("Model",o.model,s=>i({...o,model:s}))} ${this.#p("Base URL",o.baseUrl??"",s=>i({...o,baseUrl:s===""?null:s}))} ${this.#p("API key",o.apiKey??"",s=>i({...o,apiKey:s===""?null:s}))}
      </fieldset>
    `}#v(e){this.activeTab=e}async#x(e){if(this.settingsForm===null)return;let o=this.settingsForm,i={topic:o.topic,goal:o.goal,instruction:o.instruction===""?null:o.instruction,background:o.background===""?null:o.background,chatIntervalSeconds:o.chatIntervalSeconds,evaluationIntervalSeconds:o.evaluationIntervalSeconds,reportIntervalSeconds:o.reportIntervalSeconds,pythonTimeoutSeconds:o.pythonTimeoutSeconds,pythonFeedbackEvery:o.pythonFeedbackEvery,low:o.low,high:o.high};await this.store.updateRoom(e,i)}async#C(e){globalThis.confirm("Delete this room? This cannot be undone.")&&await this.store.deleteRoom(e)}#l(e){this.settingsForm!==null&&(this.settingsForm={...this.settingsForm,...e})}#_(e){this.settingsForm=Ai(e),this.settingsRoomId=e.id}#y(){this.#a===null&&(this.#a=this.store.subscribe(()=>{this.dashboardState=this.store.getState()}),this.dashboardState=this.store.getState())}#k(){let e=this.dashboardState;return e===null||e.currentRoomId===null?null:e.views[e.currentRoomId]??null}}}};function Ai(r){return{topic:r.topic,goal:r.goal,instruction:r.instruction??"",background:r.background??"",chatIntervalSeconds:r.chatIntervalSeconds,evaluationIntervalSeconds:r.evaluationIntervalSeconds,reportIntervalSeconds:r.reportIntervalSeconds,pythonTimeoutSeconds:r.pythonTimeoutSeconds,pythonFeedbackEvery:r.pythonFeedbackEvery,low:{...r.low},high:{...r.high}}}function La(r){switch(r){case"stream":return"Stream";case"settings":return"Settings";case"reports":return"Reports"}}function Ra(r){switch(r){case"active":return"brand";case"paused":return"neutral";case"failed":return"danger"}}function Ta(){function r(l,a){return function(d){e(a,"addInitializer"),o(d,"An initializer"),l.push(d)}}function t(l,a,p,d,u,C,_,k,E){var y;switch(u){case 1:y="accessor";break;case 2:y="method";break;case 3:y="getter";break;case 4:y="setter";break;default:y="field"}var w={kind:y,name:_?"#"+a:a,static:C,private:_,metadata:k},x={v:!1};w.addInitializer=r(d,x);var b,v;u===0?_?(b=p.get,v=p.set):(b=function(){return this[a]},v=function($){this[a]=$}):u===2?b=function(){return p.value}:((u===1||u===3)&&(b=function(){return p.get.call(this)}),(u===1||u===4)&&(v=function($){p.set.call(this,$)})),w.access=b&&v?{get:b,set:v}:b?{get:b}:{set:v};try{return l(E,w)}finally{x.v=!0}}function e(l,a){if(l.v)throw new Error("attempted to call "+a+" after decoration was finished")}function o(l,a){if(typeof l!="function")throw new TypeError(a+" must be a function")}function i(l,a){var p=typeof a;if(l===1){if(p!=="object"||a===null)throw new TypeError("accessor decorators must return an object with get, set, or init properties or void 0");a.get!==void 0&&o(a.get,"accessor.get"),a.set!==void 0&&o(a.set,"accessor.set"),a.init!==void 0&&o(a.init,"accessor.init")}else if(p!=="function"){var d;throw l===0?d="field":l===10?d="class":d="method",new TypeError(d+" decorators must return a function or void 0")}}function s(l,a,p,d,u,C,_,k,E){var y=p[0],w,x,b;_?u===0||u===1?w={get:p[3],set:p[4]}:u===3?w={get:p[3]}:u===4?w={set:p[3]}:w={value:p[3]}:u!==0&&(w=Object.getOwnPropertyDescriptor(a,d)),u===1?b={get:w.get,set:w.set}:u===2?b=w.value:u===3?b=w.get:u===4&&(b=w.set);var v,$,R;if(typeof y=="function")v=t(y,d,w,k,u,C,_,E,b),v!==void 0&&(i(u,v),u===0?x=v:u===1?(x=v.init,$=v.get||b.get,R=v.set||b.set,b={get:$,set:R}):b=v);else for(var T=y.length-1;T>=0;T--){var I=y[T];if(v=t(I,d,w,k,u,C,_,E,b),v!==void 0){i(u,v);var P;u===0?P=v:u===1?(P=v.init,$=v.get||b.get,R=v.set||b.set,b={get:$,set:R}):b=v,P!==void 0&&(x===void 0?x=P:typeof x=="function"?x=[x,P]:x.push(P))}}if(u===0||u===1){if(x===void 0)x=function(L,A){return A};else if(typeof x!="function"){var X=x;x=function(L,A){for(var H=A,W=0;W<X.length;W++)H=X[W].call(L,H);return H}}else{var G=x;x=function(L,A){return G.call(L,A)}}l.push(x)}u!==0&&(u===1?(w.get=b.get,w.set=b.set):u===2?w.value=b:u===3?w.get=b:u===4&&(w.set=b),_?u===1?(l.push(function(L,A){return b.get.call(L,A)}),l.push(function(L,A){return b.set.call(L,A)})):u===2?l.push(b):l.push(function(L,A){return b.call(L,A)}):Object.defineProperty(a,d,w))}function n(l,a,p){for(var d=[],u,C,_=new Map,k=new Map,E=0;E<a.length;E++){var y=a[E];if(Array.isArray(y)){var w=y[1],x=y[2],b=y.length>3,v=w>=5,$,R;if(v?($=l,w=w-5,C=C||[],R=C):($=l.prototype,u=u||[],R=u),w!==0&&!b){var T=v?k:_,I=T.get(x)||0;if(I===!0||I===3&&w!==4||I===4&&w!==3)throw new Error("Attempted to decorate a public method/accessor that has the same name as a previously decorated public method/accessor. This is not currently supported by the decorators plugin. Property name was: "+x);!I&&w>2?T.set(x,w):T.set(x,!0)}s(d,$,y,x,w,v,b,R,p)}}return c(d,u),c(d,C),d}function c(l,a){a&&l.push(function(p){for(var d=0;d<a.length;d++)a[d].call(p);return p})}function h(l,a,p){if(a.length>0){for(var d=[],u=l,C=l.name,_=a.length-1;_>=0;_--){var k={v:!1};try{var E=a[_](u,{kind:"class",name:C,addInitializer:r(d,k),metadata:p})}finally{k.v=!0}E!==void 0&&(i(10,E),u=E)}return[g(u,p),function(){for(var y=0;y<d.length;y++)d[y].call(u)}]}}function g(l,a){return Object.defineProperty(l,Symbol.metadata||Symbol.for("Symbol.metadata"),{configurable:!0,enumerable:!0,value:a})}return function(a,p,d,u){if(u!==void 0)var C=u[Symbol.metadata||Symbol.for("Symbol.metadata")];var _=Object.create(C===void 0?null:C),k=n(a,p,_);return d.length||g(a,_),{e:k,get c(){return h(a,d,_)}}}}function ji(r,t,e,o){return(ji=Ta())(r,t,e,o)}function za(r){return r}var Yi,Ii,Di,Ki,Gi,Zi,Xi,Qi,Fi,qi,Bi,Ni,Vi,Ui={provider:"openrouter",model:"",baseUrl:null,apiKey:null},Hi={name:"",topic:"",goal:"",instruction:"",background:"",low:{...Ui},high:{...Ui}};function oo(r){if(!(r instanceof HTMLElement)||!("value"in r))return"";let t=r.value;return typeof t=="string"?t:""}var Wi;Yi=B("te-dashboard-view"),Ki=Jr({context:Te,subscribe:!0}),Gi=m({attribute:!1}),Zi=K(),Xi=K(),Qi=K();new class extends za{constructor(){super(Wi),Ii()}static{class r extends(Di=it){static{({e:[Fi,qi,Bi,Ni,Vi],c:[Wi,Ii]}=ji(this,[[[Ki,Gi],1,"store"],[Zi,1,"dashboardState"],[Xi,1,"showCreateForm"],[Qi,1,"formState"]],[Yi],Di))}#t=(Vi(this),Fi(this));get store(){return this.#t}set store(e){this.#t=e}#r=qi(this,null);get dashboardState(){return this.#r}set dashboardState(e){this.#r=e}#o=Bi(this,!1);get showCreateForm(){return this.#o}set showCreateForm(e){this.#o=e}#i=Ni(this,{...Hi});get formState(){return this.#i}set formState(e){this.#i=e}#s=null;static styles=z`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      background: var(--wa-color-surface-default);
    }

    .app-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 1.25rem;
      border-bottom: var(--wa-border-width-s) solid var(--wa-color-border-normal);
      flex-shrink: 0;
    }

    .app-logo {
      font-size: 1.1rem;
      font-weight: 700;
      letter-spacing: 0.03em;
    }

    .app-tagline {
      font-size: 0.8rem;
      color: var(--wa-color-text-quiet);
    }

    .ws-status {
      margin-left: auto;
    }

    .layout {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: 22rem 1fr;
      overflow: hidden;
    }

    .sidebar {
      display: flex;
      flex-direction: column;
      border-inline-end: var(--wa-border-width-s) solid
        var(--wa-color-border-normal);
      overflow: hidden;
      background: var(--wa-color-surface-default);
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.7rem 0.75rem 0.5rem;
      flex-shrink: 0;
    }

    .sidebar-label {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--wa-color-text-quiet);
      flex: 1;
    }

    .room-list {
      margin: 0;
      padding: 0.5rem;
      list-style: none;
      overflow-y: auto;
      flex: 1;
      display: grid;
      align-content: start;
      gap: 0.2rem;
    }

    .room-btn {
      width: 100%;
      text-align: left;
      background: none;
      border: var(--wa-border-width-s) solid transparent;
      border-radius: 0.5rem;
      padding: 0.55rem 0.75rem;
      cursor: pointer;
      display: grid;
      gap: 0.2rem;
      font: inherit;
      color: inherit;
    }

    .room-btn:hover {
      background: var(--wa-color-fill-quiet);
    }

    .room-btn.is-active {
      background: var(--wa-color-brand-fill-quiet);
      border-color: var(--wa-color-brand-border-normal);
    }

    .room-title {
      font-size: 0.875rem;
      font-weight: 500;
    }

    .room-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }

    .room-time {
      font-size: 0.72rem;
      color: var(--wa-color-text-quiet);
    }

    .empty-rooms {
      padding: 1.5rem 1rem;
      text-align: center;
      color: var(--wa-color-text-quiet);
      font-size: 0.875rem;
    }

    .form-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      display: grid;
      place-items: center;
      padding: 1.5rem;
      z-index: 100;
    }

    .form-card {
      background: var(--wa-color-surface-default);
      border-radius: 0.75rem;
      padding: 1.25rem;
      width: min(40rem, 100%);
      max-height: 90vh;
      overflow-y: auto;
      display: grid;
      gap: 0.75rem;
    }

    .form-card h2 {
      margin: 0 0 0.25rem;
      font-size: 1.05rem;
    }

    .form-grid {
      display: grid;
      gap: 0.6rem;
    }

    .form-field {
      display: grid;
      gap: 0.25rem;
    }

    .form-label {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--wa-color-text-quiet);
    }

    .provider-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.6rem;
    }

    fieldset.tier {
      border: var(--wa-border-width-s) solid var(--wa-color-border-normal);
      border-radius: 0.5rem;
      padding: 0.6rem;
      display: grid;
      gap: 0.4rem;
    }

    fieldset.tier legend {
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0 0.3rem;
    }

    .form-actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      margin-top: 0.5rem;
    }

    .error-banner {
      padding: 0.5rem 0.75rem;
      border-radius: 0.5rem;
      background: var(--wa-color-danger-fill-quiet);
      color: var(--wa-color-danger-on-quiet);
      font-size: 0.85rem;
    }
  `;connectedCallback(){super.connectedCallback(),this.#p()}updated(e){e.has("store")&&(this.#s?.(),this.#s=null,this.#p())}disconnectedCallback(){this.#s?.(),this.#s=null,super.disconnectedCallback()}render(){return S`
      <header class="app-header">
        <span class="app-logo">Vemium</span>
        <span class="app-tagline">Endless agent debate</span>
        <span class="ws-status">${this.#a()}</span>
      </header>
      <div class="layout">
        <aside class="sidebar">
          <div class="sidebar-header">
            <span class="sidebar-label">Rooms</span>
            <wa-button size="small" variant="brand" @click="${()=>this.#b()}">
              + New
            </wa-button>
          </div>
          ${this.#u()}
        </aside>
        <section class="detail">
          <te-room-detail .store="${this.store}"></te-room-detail>
        </section>
      </div>
      ${this.showCreateForm?this.#e():""}
    `}#a(){if(this.dashboardState===null)return S`

      `;let e=this.dashboardState.wsConnected,o=this.dashboardState.reconnectAttempt,i=e?"success":"warning",s=e?"Connected":`Reconnecting #${o}`;return S`
      <wa-badge variant="${i}">${s}</wa-badge>
    `}#u(){if(this.dashboardState===null)return S`

      `;let e=this.dashboardState.rooms;if(e.length===0)return S`
        <p class="empty-rooms">
          No rooms yet. Create one to start a debate.
        </p>
      `;let o=this.dashboardState.currentRoomId;return S`
      <ul class="room-list">
        ${e.map(i=>this.#h(i,o))}
      </ul>
    `}#h(e,o){let i=o===e.id;return S`
      <li>
        <button
          class="room-btn ${i?"is-active":""}"
          @click="${()=>this.store.selectRoom(e.id)}"
        >
          <span class="room-title">${e.name}</span>
          <span class="room-meta">
            <span class="room-time">${ze(e.createdAt)}</span>
            ${this.#n(e.status)}
          </span>
        </button>
      </li>
    `}#n(e){let o=Oa(e);return S`
      <wa-badge variant="${o}" size="small">${e}</wa-badge>
    `}#e(){let e=this.dashboardState?.isCreatingRoom??!1,o=this.dashboardState?.errorMessage??null,i=this.formState;return S`
      <div class="form-overlay" @click="${s=>{s.target===s.currentTarget&&this.#f()}}">
        <div class="form-card">
          <h2>New room</h2>
          ${o?S`
              <div class="error-banner">${o}</div>
            `:""}
          <div class="form-grid">
            ${this.#d("Name",i.name,s=>this.#c({name:s}))} ${this.#d("Topic",i.topic,s=>this.#c({topic:s}))} ${this.#d("Goal",i.goal,s=>this.#c({goal:s}))} ${this.#m("Instruction (optional)",i.instruction,s=>this.#c({instruction:s}))} ${this.#m("Background (optional)",i.background,s=>this.#c({background:s}))}
            <div class="provider-grid">
              ${this.#g("Low tier",i.low,s=>this.#c({low:s}))} ${this.#g("High tier",i.high,s=>this.#c({high:s}))}
            </div>
          </div>
          <div class="form-actions">
            <wa-button
              size="small"
              variant="neutral"
              ?disabled="${e}"
              @click="${()=>this.#f()}"
            >
              Cancel
            </wa-button>
            <wa-button
              size="small"
              variant="brand"
              ?disabled="${e}"
              @click="${()=>this.#v()}"
            >
              Create
            </wa-button>
          </div>
        </div>
      </div>
    `}#d(e,o,i){return S`
      <label class="form-field">
        <span class="form-label">${e}</span>
        <wa-input size="small" .value="${o}" @input="${s=>i(oo(s.target))}"></wa-input>
      </label>
    `}#m(e,o,i){return S`
      <label class="form-field">
        <span class="form-label">${e}</span>
        <wa-textarea
          size="small"
          rows="3"
          .value="${o}"
          @input="${s=>i(oo(s.target))}"
        ></wa-textarea>
      </label>
    `}#g(e,o,i){return S`
      <fieldset class="tier">
        <legend>${e}</legend>
        ${this.#w(o.provider,s=>i({...o,provider:s}))} ${this.#d("Model",o.model,s=>i({...o,model:s}))} ${this.#d("Base URL (optional for ollama)",o.baseUrl??"",s=>i({...o,baseUrl:s===""?null:s}))} ${this.#d("API key (omit for ollama)",o.apiKey??"",s=>i({...o,apiKey:s===""?null:s}))}
      </fieldset>
    `}#w(e,o){return S`
      <label class="form-field">
        <span class="form-label">Provider</span>
        <wa-select size="small" .value="${e}" @change="${s=>{let n=oo(s.target);(n==="ollama"||n==="openrouter"||n==="openai_compat")&&o(n)}}">
          ${[{id:"ollama",label:"Ollama"},{id:"openrouter",label:"OpenRouter"},{id:"openai_compat",label:"OpenAI-compat"}].map(s=>S`
              <wa-option value="${s.id}">${s.label}</wa-option>
            `)}
        </wa-select>
      </label>
    `}#p(){this.#s===null&&(this.#s=this.store.subscribe(()=>{this.dashboardState=this.store.getState()}),this.dashboardState=this.store.getState())}#b(){this.formState={...Hi},this.showCreateForm=!0}#f(){this.showCreateForm=!1}#c(e){this.formState={...this.formState,...e}}async#v(){let e={name:this.formState.name,topic:this.formState.topic,goal:this.formState.goal,instruction:this.formState.instruction===""?null:this.formState.instruction,background:this.formState.background===""?null:this.formState.background,low:this.formState.low,high:this.formState.high};await this.store.createRoom(e)!==null&&(this.showCreateForm=!1)}}}};function Oa(r){switch(r){case"active":return"brand";case"paused":return"neutral";case"failed":return"danger"}}function Pa(){function r(l,a){return function(d){e(a,"addInitializer"),o(d,"An initializer"),l.push(d)}}function t(l,a,p,d,u,C,_,k,E){var y;switch(u){case 1:y="accessor";break;case 2:y="method";break;case 3:y="getter";break;case 4:y="setter";break;default:y="field"}var w={kind:y,name:_?"#"+a:a,static:C,private:_,metadata:k},x={v:!1};w.addInitializer=r(d,x);var b,v;u===0?_?(b=p.get,v=p.set):(b=function(){return this[a]},v=function($){this[a]=$}):u===2?b=function(){return p.value}:((u===1||u===3)&&(b=function(){return p.get.call(this)}),(u===1||u===4)&&(v=function($){p.set.call(this,$)})),w.access=b&&v?{get:b,set:v}:b?{get:b}:{set:v};try{return l(E,w)}finally{x.v=!0}}function e(l,a){if(l.v)throw new Error("attempted to call "+a+" after decoration was finished")}function o(l,a){if(typeof l!="function")throw new TypeError(a+" must be a function")}function i(l,a){var p=typeof a;if(l===1){if(p!=="object"||a===null)throw new TypeError("accessor decorators must return an object with get, set, or init properties or void 0");a.get!==void 0&&o(a.get,"accessor.get"),a.set!==void 0&&o(a.set,"accessor.set"),a.init!==void 0&&o(a.init,"accessor.init")}else if(p!=="function"){var d;throw l===0?d="field":l===10?d="class":d="method",new TypeError(d+" decorators must return a function or void 0")}}function s(l,a,p,d,u,C,_,k,E){var y=p[0],w,x,b;_?u===0||u===1?w={get:p[3],set:p[4]}:u===3?w={get:p[3]}:u===4?w={set:p[3]}:w={value:p[3]}:u!==0&&(w=Object.getOwnPropertyDescriptor(a,d)),u===1?b={get:w.get,set:w.set}:u===2?b=w.value:u===3?b=w.get:u===4&&(b=w.set);var v,$,R;if(typeof y=="function")v=t(y,d,w,k,u,C,_,E,b),v!==void 0&&(i(u,v),u===0?x=v:u===1?(x=v.init,$=v.get||b.get,R=v.set||b.set,b={get:$,set:R}):b=v);else for(var T=y.length-1;T>=0;T--){var I=y[T];if(v=t(I,d,w,k,u,C,_,E,b),v!==void 0){i(u,v);var P;u===0?P=v:u===1?(P=v.init,$=v.get||b.get,R=v.set||b.set,b={get:$,set:R}):b=v,P!==void 0&&(x===void 0?x=P:typeof x=="function"?x=[x,P]:x.push(P))}}if(u===0||u===1){if(x===void 0)x=function(L,A){return A};else if(typeof x!="function"){var X=x;x=function(L,A){for(var H=A,W=0;W<X.length;W++)H=X[W].call(L,H);return H}}else{var G=x;x=function(L,A){return G.call(L,A)}}l.push(x)}u!==0&&(u===1?(w.get=b.get,w.set=b.set):u===2?w.value=b:u===3?w.get=b:u===4&&(w.set=b),_?u===1?(l.push(function(L,A){return b.get.call(L,A)}),l.push(function(L,A){return b.set.call(L,A)})):u===2?l.push(b):l.push(function(L,A){return b.call(L,A)}):Object.defineProperty(a,d,w))}function n(l,a,p){for(var d=[],u,C,_=new Map,k=new Map,E=0;E<a.length;E++){var y=a[E];if(Array.isArray(y)){var w=y[1],x=y[2],b=y.length>3,v=w>=5,$,R;if(v?($=l,w=w-5,C=C||[],R=C):($=l.prototype,u=u||[],R=u),w!==0&&!b){var T=v?k:_,I=T.get(x)||0;if(I===!0||I===3&&w!==4||I===4&&w!==3)throw new Error("Attempted to decorate a public method/accessor that has the same name as a previously decorated public method/accessor. This is not currently supported by the decorators plugin. Property name was: "+x);!I&&w>2?T.set(x,w):T.set(x,!0)}s(d,$,y,x,w,v,b,R,p)}}return c(d,u),c(d,C),d}function c(l,a){a&&l.push(function(p){for(var d=0;d<a.length;d++)a[d].call(p);return p})}function h(l,a,p){if(a.length>0){for(var d=[],u=l,C=l.name,_=a.length-1;_>=0;_--){var k={v:!1};try{var E=a[_](u,{kind:"class",name:C,addInitializer:r(d,k),metadata:p})}finally{k.v=!0}E!==void 0&&(i(10,E),u=E)}return[g(u,p),function(){for(var y=0;y<d.length;y++)d[y].call(u)}]}}function g(l,a){return Object.defineProperty(l,Symbol.metadata||Symbol.for("Symbol.metadata"),{configurable:!0,enumerable:!0,value:a})}return function(a,p,d,u){if(u!==void 0)var C=u[Symbol.metadata||Symbol.for("Symbol.metadata")];var _=Object.create(C===void 0?null:C),k=n(a,p,_);return d.length||g(a,_),{e:k,get c(){return h(a,d,_)}}}}function rs(r,t,e,o){return(rs=Pa())(r,t,e,o)}function Ma(r){return r}var os,Ji,ts,es;os=B("te-app-shell");new class extends Ma{constructor(){super(es),Ji()}static{class r extends(ts=it){static{({c:[es,Ji]}=rs(this,[],[os],ts))}static styles=z`
    :host {
      display: block;
    }
  `;render(){return S`
      <te-dashboard-provider>
        <te-dashboard-view></te-dashboard-view>
      </te-dashboard-provider>
    `}}}};var le=z`
  :where(:root),
  .wa-neutral,
  :host([variant='neutral']) {
    --wa-color-fill-loud: var(--wa-color-neutral-fill-loud);
    --wa-color-fill-normal: var(--wa-color-neutral-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-neutral-fill-quiet);
    --wa-color-border-loud: var(--wa-color-neutral-border-loud);
    --wa-color-border-normal: var(--wa-color-neutral-border-normal);
    --wa-color-border-quiet: var(--wa-color-neutral-border-quiet);
    --wa-color-on-loud: var(--wa-color-neutral-on-loud);
    --wa-color-on-normal: var(--wa-color-neutral-on-normal);
    --wa-color-on-quiet: var(--wa-color-neutral-on-quiet);
  }

  .wa-brand,
  :host([variant='brand']) {
    --wa-color-fill-loud: var(--wa-color-brand-fill-loud);
    --wa-color-fill-normal: var(--wa-color-brand-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-brand-fill-quiet);
    --wa-color-border-loud: var(--wa-color-brand-border-loud);
    --wa-color-border-normal: var(--wa-color-brand-border-normal);
    --wa-color-border-quiet: var(--wa-color-brand-border-quiet);
    --wa-color-on-loud: var(--wa-color-brand-on-loud);
    --wa-color-on-normal: var(--wa-color-brand-on-normal);
    --wa-color-on-quiet: var(--wa-color-brand-on-quiet);
  }

  .wa-success,
  :host([variant='success']) {
    --wa-color-fill-loud: var(--wa-color-success-fill-loud);
    --wa-color-fill-normal: var(--wa-color-success-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-success-fill-quiet);
    --wa-color-border-loud: var(--wa-color-success-border-loud);
    --wa-color-border-normal: var(--wa-color-success-border-normal);
    --wa-color-border-quiet: var(--wa-color-success-border-quiet);
    --wa-color-on-loud: var(--wa-color-success-on-loud);
    --wa-color-on-normal: var(--wa-color-success-on-normal);
    --wa-color-on-quiet: var(--wa-color-success-on-quiet);
  }

  .wa-warning,
  :host([variant='warning']) {
    --wa-color-fill-loud: var(--wa-color-warning-fill-loud);
    --wa-color-fill-normal: var(--wa-color-warning-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-warning-fill-quiet);
    --wa-color-border-loud: var(--wa-color-warning-border-loud);
    --wa-color-border-normal: var(--wa-color-warning-border-normal);
    --wa-color-border-quiet: var(--wa-color-warning-border-quiet);
    --wa-color-on-loud: var(--wa-color-warning-on-loud);
    --wa-color-on-normal: var(--wa-color-warning-on-normal);
    --wa-color-on-quiet: var(--wa-color-warning-on-quiet);
  }

  .wa-danger,
  :host([variant='danger']) {
    --wa-color-fill-loud: var(--wa-color-danger-fill-loud);
    --wa-color-fill-normal: var(--wa-color-danger-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-danger-fill-quiet);
    --wa-color-border-loud: var(--wa-color-danger-border-loud);
    --wa-color-border-normal: var(--wa-color-danger-border-normal);
    --wa-color-border-quiet: var(--wa-color-danger-border-quiet);
    --wa-color-on-loud: var(--wa-color-danger-on-loud);
    --wa-color-on-normal: var(--wa-color-danger-on-normal);
    --wa-color-on-quiet: var(--wa-color-danger-on-quiet);
  }
`;var is=z`
  :host {
    --pulse-color: var(--wa-color-fill-loud, var(--wa-color-brand-fill-loud));

    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.375em 0.625em;
    color: var(--wa-color-on-loud, var(--wa-color-brand-on-loud));
    font-size: max(var(--wa-font-size-3xs), 0.75em);
    font-weight: var(--wa-font-weight-semibold);
    line-height: 1;
    vertical-align: middle;
    white-space: nowrap;
    background-color: var(--wa-color-fill-loud, var(--wa-color-brand-fill-loud));
    border-color: transparent;
    border-radius: var(--wa-border-radius-s);
    border-style: var(--wa-border-style);
    border-width: var(--wa-border-width-s);
    user-select: none;
    -webkit-user-select: none;
    cursor: inherit;
  }

  /* Appearance modifiers */
  :host([appearance='outlined']) {
    --pulse-color: var(--wa-color-border-loud, var(--wa-color-brand-border-loud));

    color: var(--wa-color-on-quiet, var(--wa-color-brand-on-quiet));
    background-color: transparent;
    border-color: var(--wa-color-border-loud, var(--wa-color-brand-border-loud));
  }

  :host([appearance='filled']) {
    --pulse-color: var(--wa-color-fill-normal, var(--wa-color-brand-fill-normal));

    color: var(--wa-color-on-normal, var(--wa-color-brand-on-normal));
    background-color: var(--wa-color-fill-normal, var(--wa-color-brand-fill-normal));
    border-color: transparent;
  }

  :host([appearance='filled-outlined']) {
    --pulse-color: var(--wa-color-border-normal, var(--wa-color-brand-border-normal));

    color: var(--wa-color-on-normal, var(--wa-color-brand-on-normal));
    background-color: var(--wa-color-fill-normal, var(--wa-color-brand-fill-normal));
    border-color: var(--wa-color-border-normal, var(--wa-color-brand-border-normal));
  }

  :host([appearance='accent']) {
    --pulse-color: var(--wa-color-fill-loud, var(--wa-color-brand-fill-loud));

    color: var(--wa-color-on-loud, var(--wa-color-brand-on-loud));
    background-color: var(--wa-color-fill-loud, var(--wa-color-brand-fill-loud));
    border-color: transparent;
  }

  /* Pill modifier */
  :host([pill]) {
    border-radius: var(--wa-border-radius-pill);
  }

  /* Pulse attention */
  :host([attention='pulse']) {
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 var(--pulse-color);
    }
    70% {
      box-shadow: 0 0 0 0.5rem transparent;
    }
    100% {
      box-shadow: 0 0 0 0 transparent;
    }
  }

  /* Bounce attention */
  :host([attention='bounce']) {
    animation: bounce 1s cubic-bezier(0.28, 0.84, 0.42, 1) infinite;
  }

  @keyframes bounce {
    0%,
    20%,
    50%,
    80%,
    100% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-5px);
    }
    60% {
      transform: translateY(-2px);
    }
  }

  /* Slots */
  slot[name='start']::slotted(*) {
    margin-inline-end: 0.375em;
  }

  slot[name='end']::slotted(*) {
    margin-inline-start: 0.375em;
  }
`;var Ia=Object.defineProperty,Da=Object.getOwnPropertyDescriptor,ss=r=>{throw TypeError(r)},f=(r,t,e,o)=>{for(var i=o>1?void 0:o?Da(t,e):t,s=r.length-1,n;s>=0;s--)(n=r[s])&&(i=(o?n(t,e,i):n(i))||i);return o&&i&&Ia(t,e,i),i},ns=(r,t,e)=>t.has(r)||ss("Cannot "+e),as=(r,t,e)=>(ns(r,t,"read from private field"),e?e.call(r):t.get(r)),ls=(r,t,e)=>t.has(r)?ss("Cannot add the same private member more than once"):t instanceof WeakSet?t.add(r):t.set(r,e),cs=(r,t,e,o)=>(ns(r,t,"write to private field"),o?o.call(r,e):t.set(r,e),e);var Fa=z`
  :host {
    box-sizing: border-box;
  }

  :host *,
  :host *::before,
  :host *::after {
    box-sizing: inherit;
  }

  [hidden] {
    display: none !important;
  }
`,fr,Z=class extends it{constructor(){super(),ls(this,fr,!1),this.initialReflectedProperties=new Map,this.didSSR=!0,this.customStates={set:(t,e)=>{if(this.internals?.states)try{e?this.internals.states.add(t):this.internals.states.delete(t)}catch(o){if(String(o).includes("must start with '--'"))console.error("Your browser implements an outdated version of CustomStateSet. Consider using a polyfill");else throw o}},has:t=>{if(!this.internals?.states)return!1;try{return this.internals.states.has(t)}catch{return!1}}};try{this.internals=this.attachInternals()}catch{console.error("Element internals are not supported in your browser. Consider using a polyfill")}this.customStates.set("wa-defined",!0);let r=this.constructor;for(let[t,e]of r.elementProperties)e.default==="inherit"&&e.initial!==void 0&&typeof t=="string"&&this.customStates.set(`initial-${t}-${e.initial}`,!0)}static get styles(){let r=Array.isArray(this.css)?this.css:this.css?[this.css]:[];return[Fa,...r]}connectedCallback(){super.connectedCallback(),!0}attributeChangedCallback(r,t,e){as(this,fr)||(this.constructor.elementProperties.forEach((o,i)=>{o.reflect&&this[i]!=null&&this.initialReflectedProperties.set(i,this[i])}),cs(this,fr,!0)),super.attributeChangedCallback(r,t,e)}willUpdate(r){super.willUpdate(r),this.initialReflectedProperties.forEach((t,e)=>{r.has(e)&&this[e]==null&&(this[e]=t)})}firstUpdated(r){super.firstUpdated(r),this.didSSR&&this.shadowRoot?.querySelectorAll("slot").forEach(t=>{t.dispatchEvent(new Event("slotchange",{bubbles:!0,composed:!1,cancelable:!1}))})}update(r){try{super.update(r)}catch(t){if(this.didSSR&&!this.hasUpdated){let e=new Event("lit-hydration-error",{bubbles:!0,composed:!0,cancelable:!1});e.error=t,this.dispatchEvent(e)}throw t}}relayNativeEvent(r,t){r.stopImmediatePropagation(),this.dispatchEvent(new r.constructor(r.type,{...r,...t}))}};fr=new WeakMap;f([m()],Z.prototype,"dir",2);f([m()],Z.prototype,"lang",2);f([m({type:Boolean,reflect:!0,attribute:"did-ssr"})],Z.prototype,"didSSR",2);var Dt=class extends Z{constructor(){super(...arguments),this.variant="brand",this.appearance="accent",this.pill=!1,this.attention="none"}render(){return S`
      <span part="start">
        <slot name="start"></slot>
      </span>

      <span part="base" role="status">
        <slot></slot>
      </span>

      <span part="end">
        <slot name="end"></slot>
      </span>
    `}};Dt.css=[le,is];f([m({reflect:!0})],Dt.prototype,"variant",2);f([m({reflect:!0})],Dt.prototype,"appearance",2);f([m({type:Boolean,reflect:!0})],Dt.prototype,"pill",2);f([m({reflect:!0})],Dt.prototype,"attention",2);Dt=f([B("wa-badge")],Dt);var ce=()=>({checkValidity(r){let t=r.input,e={message:"",isValid:!0,invalidKeys:[]};if(!t)return e;let o=!0;if("checkValidity"in t&&(o=t.checkValidity()),o)return e;if(e.isValid=!1,"validationMessage"in t&&(e.message=t.validationMessage),!("validity"in t))return e.invalidKeys.push("customError"),e;for(let i in t.validity){if(i==="valid")continue;let s=i;t.validity[s]&&e.invalidKeys.push(s)}return e}});var mr=class extends Event{constructor(){super("wa-invalid",{bubbles:!0,cancelable:!1,composed:!0})}};var qa=()=>({observedAttributes:["custom-error"],checkValidity(r){let t={message:"",isValid:!0,invalidKeys:[]};return r.customError&&(t.message=r.customError,t.isValid=!1,t.invalidKeys=["customError"]),t}}),tt=class extends Z{constructor(){super(),this.name=null,this.disabled=!1,this.required=!1,this.assumeInteractionOn=["input"],this.validators=[],this.valueHasChanged=!1,this.hasInteracted=!1,this.customError=null,this.emittedEvents=[],this.emitInvalid=r=>{r.target===this&&(this.hasInteracted=!0,this.dispatchEvent(new mr))},this.handleInteraction=r=>{let t=this.emittedEvents;t.includes(r.type)||t.push(r.type),t.length===this.assumeInteractionOn?.length&&(this.hasInteracted=!0)},!0}static get validators(){return[qa()]}static get observedAttributes(){let r=new Set(super.observedAttributes||[]);for(let t of this.validators)if(t.observedAttributes)for(let e of t.observedAttributes)r.add(e);return[...r]}connectedCallback(){super.connectedCallback(),this.updateValidity(),this.assumeInteractionOn.forEach(r=>{this.addEventListener(r,this.handleInteraction)})}firstUpdated(...r){super.firstUpdated(...r),this.updateValidity()}willUpdate(r){if(!!0&&r.has("customError")&&(this.customError||(this.customError=null),this.setCustomValidity(this.customError||"")),r.has("value")||r.has("disabled")||r.has("defaultValue")){let t=this.value;if(Array.isArray(t)){if(this.name){let e=new FormData;for(let o of t)e.append(this.name,o);this.setValue(e,e)}}else this.setValue(t,t)}r.has("disabled")&&(this.customStates.set("disabled",this.disabled),(this.hasAttribute("disabled")||!!0&&!this.matches(":disabled"))&&this.toggleAttribute("disabled",this.disabled)),super.willUpdate(r),this.updateValidity()}get labels(){return this.internals.labels}getForm(){return this.internals.form}set form(r){r?this.setAttribute("form",r):this.removeAttribute("form")}get form(){return this.internals.form}get validity(){return this.internals.validity}get willValidate(){return this.internals.willValidate}get validationMessage(){return this.internals.validationMessage}checkValidity(){return this.updateValidity(),this.internals.checkValidity()}reportValidity(){return this.updateValidity(),this.hasInteracted=!0,this.internals.reportValidity()}get validationTarget(){return this.input||void 0}setValidity(...r){let t=r[0],e=r[1],o=r[2];o||(o=this.validationTarget),this.internals.setValidity(t,e,o||void 0),this.requestUpdate("validity"),this.setCustomStates()}setCustomStates(){let r=!!this.required,t=this.internals.validity.valid,e=this.hasInteracted;this.customStates.set("required",r),this.customStates.set("optional",!r),this.customStates.set("invalid",!t),this.customStates.set("valid",t),this.customStates.set("user-invalid",!t&&e),this.customStates.set("user-valid",t&&e)}setCustomValidity(r){if(!r){this.customError=null,this.setValidity({});return}this.customError=r,this.setValidity({customError:!0},r,this.validationTarget)}formResetCallback(){this.resetValidity(),this.hasInteracted=!1,this.valueHasChanged=!1,this.emittedEvents=[],this.updateValidity()}formDisabledCallback(r){this.disabled=r,this.updateValidity()}formStateRestoreCallback(r,t){this.value=r,t==="restore"&&this.resetValidity(),this.updateValidity()}setValue(...r){let[t,e]=r;this.internals.setFormValue(t,e)}get allValidators(){let r=this.constructor.validators||[],t=this.validators||[];return[...r,...t]}resetValidity(){this.setCustomValidity(""),this.setValidity({})}updateValidity(){if(this.disabled||this.hasAttribute("disabled")||!this.willValidate){this.resetValidity();return}let r=this.allValidators;if(!r?.length)return;let t={customError:!!this.customError},e=this.validationTarget||this.input||void 0,o="";for(let i of r){let{isValid:s,message:n,invalidKeys:c}=i.checkValidity(this);s||(o||(o=n),c?.length>=0&&c.forEach(h=>t[h]=!0))}o||(o=this.validationMessage),this.setValidity(t,o,e)}};tt.formAssociated=!0;f([m({reflect:!0})],tt.prototype,"name",2);f([m({type:Boolean})],tt.prototype,"disabled",2);f([m({state:!0,attribute:!1})],tt.prototype,"valueHasChanged",2);f([m({state:!0,attribute:!1})],tt.prototype,"hasInteracted",2);f([m({attribute:"custom-error",reflect:!0})],tt.prototype,"customError",2);f([m({attribute:!1,state:!0,type:Object})],tt.prototype,"validity",1);var yt=class{constructor(r,...t){this.slotNames=[],this.handleSlotChange=e=>{let o=e.target;(this.slotNames.includes("[default]")&&!o.name||o.name&&this.slotNames.includes(o.name))&&this.host.requestUpdate()},(this.host=r).addController(this),this.slotNames=t}hasDefaultSlot(){return this.host.childNodes?[...this.host.childNodes].some(r=>{if(r.nodeType===Node.TEXT_NODE&&r.textContent.trim()!=="")return!0;if(r.nodeType===Node.ELEMENT_NODE){let t=r;if(t.tagName.toLowerCase()==="wa-visually-hidden")return!1;if(!t.hasAttribute("slot"))return!0}return!1}):!1}hasNamedSlot(r){return this.host.querySelector?.(`:scope > [slot="${r}"]`)!==null}test(r){return r==="[default]"?this.hasDefaultSlot():this.hasNamedSlot(r)}hostConnected(){this.host.shadowRoot?.addEventListener?.("slotchange",this.handleSlotChange)}hostDisconnected(){this.host.shadowRoot?.removeEventListener?.("slotchange",this.handleSlotChange)}};var us=z`
  @layer wa-component {
    :host {
      display: inline-block;

      /* Workaround because Chrome doesn't like :host(:has()) below
       * https://issues.chromium.org/issues/40062355
       * Firefox doesn't like this nested rule, so both are needed */
      &:has(wa-badge) {
        position: relative;
      }
    }

    /* Apply relative positioning only when needed to position wa-badge
     * This avoids creating a new stacking context for every button */
    :host(:has(wa-badge)) {
      position: relative;
    }
  }

  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    user-select: none;
    -webkit-user-select: none;
    white-space: nowrap;
    vertical-align: middle;
    transition-property: background, border, box-shadow, color, opacity;
    transition-duration: var(--wa-transition-fast);
    transition-timing-function: var(--wa-transition-easing);
    cursor: pointer;
    padding: 0 var(--wa-form-control-padding-inline);
    font-family: inherit;
    font-size: inherit;
    font-weight: var(--wa-font-weight-action);
    line-height: calc(var(--wa-form-control-height) - var(--wa-form-control-border-width) * 2);
    height: var(--wa-form-control-height);
    width: 100%;

    background-color: var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud));
    border-color: transparent;
    color: var(--wa-color-on-loud, var(--wa-color-neutral-on-loud));
    border-start-start-radius: var(--_button-start-start-radius, var(--wa-form-control-border-radius));
    border-start-end-radius: var(--_button-start-end-radius, var(--wa-form-control-border-radius));
    border-end-start-radius: var(--_button-end-start-radius, var(--wa-form-control-border-radius));
    border-end-end-radius: var(--_button-end-end-radius, var(--wa-form-control-border-radius));
    border-style: var(--wa-form-control-border-style);
    border-width: var(--wa-form-control-border-width);
  }

  /* Appearance modifiers */
  :host([appearance='plain']) {
    /* Indentation overrides for grouping */
    margin-inline-start: var(--_button-horizontal-indent);
    margin-block-start: var(--_button-vertical-indent);

    .button {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: transparent;
      border-color: transparent;
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
        background-color: var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet));
      }
    }
    .button:not(.disabled):not(.loading):active {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet)),
        var(--wa-color-mix-active)
      );
    }
  }

  :host([appearance='outlined']) {
    /* Indentation overrides for grouping outlined */
    margin-inline-start: var(--_button-horizontal-indent-outlined);
    margin-block-start: var(--_button-vertical-indent-outlined);

    .button {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: transparent;
      border-color: var(--wa-color-border-loud, var(--wa-color-neutral-border-loud));
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
        background-color: var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet));
      }
    }
    .button:not(.disabled):not(.loading):active {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet)),
        var(--wa-color-mix-active)
      );
    }
  }

  :host([appearance='filled']) {
    /* Indentation overrides for grouping */
    margin-inline-start: var(--_button-horizontal-indent);
    margin-block-start: var(--_button-vertical-indent);

    .button {
      color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
      background-color: var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal));
      border-color: transparent;
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
        background-color: color-mix(
          in oklab,
          var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal)),
          var(--wa-color-mix-hover)
        );
      }
    }
    .button:not(.disabled):not(.loading):active {
      color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal)),
        var(--wa-color-mix-active)
      );
    }
  }

  :host([appearance='filled-outlined']) {
    /* Indentation overrides for grouping outlined */
    margin-inline-start: var(--_button-horizontal-indent-outlined);
    margin-block-start: var(--_button-vertical-indent-outlined);

    .button {
      color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
      background-color: var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal));
      border-color: var(--wa-color-border-normal, var(--wa-color-neutral-border-normal));
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
        background-color: color-mix(
          in oklab,
          var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal)),
          var(--wa-color-mix-hover)
        );
      }
    }
    .button:not(.disabled):not(.loading):active {
      color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal)),
        var(--wa-color-mix-active)
      );
    }
  }

  :host([appearance='accent']) {
    /* Indentation overrides for grouping */
    margin-inline-start: var(--_button-horizontal-indent);
    margin-block-start: var(--_button-vertical-indent);

    .button {
      color: var(--wa-color-on-loud, var(--wa-color-neutral-on-loud));
      background-color: var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud));
      border-color: transparent;
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        background-color: color-mix(
          in oklab,
          var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud)),
          var(--wa-color-mix-hover)
        );
      }
    }
    .button:not(.disabled):not(.loading):active {
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud)),
        var(--wa-color-mix-active)
      );
    }
  }

  /* Focus states */
  .button:focus {
    outline: none;
  }

  .button:focus-visible {
    outline: var(--wa-focus-ring);
    outline-offset: var(--wa-focus-ring-offset);
  }

  /* Disabled state */
  :host([disabled]) {
    opacity: 0.5;
    cursor: not-allowed;

    /* When disabled, prevent mouse events from bubbling up from children */
    .button {
      pointer-events: none;
    }
  }

  /* Keep it last so Safari doesn't stop parsing this block */
  .button::-moz-focus-inner {
    border: 0;
  }

  /* Icon buttons */
  .button.is-icon-button {
    outline-offset: 2px;
    width: var(--wa-form-control-height);
    aspect-ratio: 1;
  }

  .button.is-icon-button:has(wa-icon) {
    width: auto;
  }

  /* Pill modifier */
  :host([pill]) .button {
    border-start-start-radius: var(--_button-start-start-radius, var(--wa-border-radius-pill));
    border-start-end-radius: var(--_button-start-end-radius, var(--wa-border-radius-pill));
    border-end-start-radius: var(--_button-end-start-radius, var(--wa-border-radius-pill));
    border-end-end-radius: var(--_button-end-end-radius, var(--wa-border-radius-pill));
  }

  /*
   * Label
   */

  .start,
  .end {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    pointer-events: none;
  }

  .label {
    display: inline-block;
  }

  .is-icon-button .label {
    display: flex;
  }

  .label::slotted(wa-icon) {
    align-self: center;
  }

  /*
   * Caret modifier
   */

  wa-icon[part='caret'] {
    display: flex;
    align-self: center;
    align-items: center;

    &::part(svg) {
      width: 0.875em;
      height: 0.875em;
    }

    .button:has(&) .end {
      display: none;
    }
  }

  /*
   * Loading modifier
   */

  .loading {
    position: relative;
    cursor: wait;

    .start,
    .label,
    .end,
    .caret {
      visibility: hidden;
    }

    wa-spinner {
      --indicator-color: currentColor;
      --track-color: color-mix(in oklab, currentColor, transparent 90%);

      position: absolute;
      font-size: 1em;
      height: 1em;
      width: 1em;
      top: calc(50% - 0.5em);
      left: calc(50% - 0.5em);
    }
  }

  /*
   * Badges
   */

  .button ::slotted(wa-badge) {
    border-color: var(--wa-color-surface-default);
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    translate: 50% -50%;
    pointer-events: none;
  }

  :host(:dir(rtl)) ::slotted(wa-badge) {
    translate: -50% -50%;
  }

  /*
  * Button spacing
  */

  slot[name='start']::slotted(*) {
    margin-inline-end: 0.75em;
  }

  slot[name='end']::slotted(*),
  .button:not(.visually-hidden-label) [part='caret'] {
    margin-inline-start: 0.75em;
  }
`;var ht=z`
  :host([size='small']),
  .wa-size-s {
    font-size: var(--wa-font-size-s);
  }

  :host([size='medium']),
  .wa-size-m {
    font-size: var(--wa-font-size-m);
  }

  :host([size='large']),
  .wa-size-l {
    font-size: var(--wa-font-size-l);
  }
`;var io=new Set,ue=new Map,jt,so="ltr",no="en",hs=typeof MutationObserver<"u"&&typeof document<"u"&&typeof document.documentElement<"u";if(hs){let r=new MutationObserver(ds);so=document.documentElement.dir||"ltr",no=document.documentElement.lang||navigator.language,r.observe(document.documentElement,{attributes:!0,attributeFilter:["dir","lang"]})}function Ie(...r){r.map(t=>{let e=t.$code.toLowerCase();ue.has(e)?ue.set(e,Object.assign(Object.assign({},ue.get(e)),t)):ue.set(e,t),jt||(jt=t)}),ds()}function ds(){hs&&(so=document.documentElement.dir||"ltr",no=document.documentElement.lang||navigator.language),[...io.keys()].map(r=>{typeof r.requestUpdate=="function"&&r.requestUpdate()})}var gr=class{constructor(t){this.host=t,this.host.addController(this)}hostConnected(){io.add(this.host)}hostDisconnected(){io.delete(this.host)}dir(){return`${this.host.dir||so}`.toLowerCase()}lang(){return`${this.host.lang||no}`.toLowerCase()}getTranslationData(t){var e,o;let i=new Intl.Locale(t.replace(/_/g,"-")),s=i?.language.toLowerCase(),n=(o=(e=i?.region)===null||e===void 0?void 0:e.toLowerCase())!==null&&o!==void 0?o:"",c=ue.get(`${s}-${n}`),h=ue.get(s);return{locale:i,language:s,region:n,primary:c,secondary:h}}exists(t,e){var o;let{primary:i,secondary:s}=this.getTranslationData((o=e.lang)!==null&&o!==void 0?o:this.lang());return e=Object.assign({includeFallback:!1},e),!!(i&&i[t]||s&&s[t]||e.includeFallback&&jt&&jt[t])}term(t,...e){let{primary:o,secondary:i}=this.getTranslationData(this.lang()),s;if(o&&o[t])s=o[t];else if(i&&i[t])s=i[t];else if(jt&&jt[t])s=jt[t];else return console.error(`No translation found for: ${String(t)}`),String(t);return typeof s=="function"?s(...e):s}date(t,e){return t=new Date(t),new Intl.DateTimeFormat(this.lang(),e).format(t)}number(t,e){return t=Number(t),isNaN(t)?"":new Intl.NumberFormat(this.lang(),e).format(t)}relativeTime(t,e,o){return new Intl.RelativeTimeFormat(this.lang(),o).format(t,e)}};var ps={$code:"en",$name:"English",$dir:"ltr",carousel:"Carousel",clearEntry:"Clear entry",close:"Close",createOption:r=>`Create "${r}"`,copied:"Copied",copy:"Copy",currentValue:"Current value",dropFileHere:"Drop file here or click to browse",decrement:"Decrement",dropFilesHere:"Drop files here or click to browse",error:"Error",goToSlide:(r,t)=>`Go to slide ${r} of ${t}`,hidePassword:"Hide password",increment:"Increment",loading:"Loading",nextSlide:"Next slide",numCharacters:r=>r===1?"1 character":`${r} characters`,numCharactersRemaining:r=>r===1?"1 character remaining":`${r} characters remaining`,numOptionsSelected:r=>r===0?"No options selected":r===1?"1 option selected":`${r} options selected`,pauseAnimation:"Pause animation",playAnimation:"Play animation",previousSlide:"Previous slide",progress:"Progress",remove:"Remove",resize:"Resize",scrollableRegion:"Scrollable region",scrollToEnd:"Scroll to end",scrollToStart:"Scroll to start",selectAColorFromTheScreen:"Select a color from the screen",showPassword:"Show password",slideNum:r=>`Slide ${r}`,toggleColorFormat:"Toggle color format",zoomIn:"Zoom in",zoomOut:"Zoom out"};Ie(ps);var fs=ps;var st=class extends gr{};Ie(fs);function nt(r,t){let e={waitUntilFirstUpdate:!1,...t};return(o,i)=>{let{update:s}=o,n=Array.isArray(r)?r:[r];o.update=function(c){n.forEach(h=>{let g=h;if(c.has(g)){let l=c.get(g),a=this[g];l!==a&&(!e.waitUntilFirstUpdate||this.hasUpdated)&&this[i](l,a)}}),s.call(this,c)}}}var et=ae(class extends It{constructor(r){if(super(r),r.type!==ft.ATTRIBUTE||r.name!=="class"||r.strings?.length>2)throw Error("`classMap()` can only be used in the `class` attribute and must be the only part in the attribute.")}render(r){return" "+Object.keys(r).filter(t=>r[t]).join(" ")+" "}update(r,[t]){if(this.st===void 0){this.st=new Set,r.strings!==void 0&&(this.nt=new Set(r.strings.join(" ").split(/\s/).filter(o=>o!=="")));for(let o in t)t[o]&&!this.nt?.has(o)&&this.st.add(o);return this.render(t)}let e=r.element.classList;for(let o of this.st)o in t||(e.remove(o),this.st.delete(o));for(let o in t){let i=!!t[o];i===this.st.has(o)||this.nt?.has(o)||(i?(e.add(o),this.st.add(o)):(e.remove(o),this.st.delete(o)))}return ot}});var D=r=>r??Y;var gs=Symbol.for(""),Ba=r=>{if(r?.r===gs)return r?._$litStatic$};var ao=(r,...t)=>({_$litStatic$:t.reduce((e,o,i)=>e+(s=>{if(s._$litStatic$!==void 0)return s._$litStatic$;throw Error(`Value passed to 'literal' function must be a 'literal' result: ${s}. Use 'unsafeStatic' to pass non-literal values, but
            take care to ensure page security.`)})(o)+r[i+1],r[0]),r:gs}),ms=new Map,lo=r=>(t,...e)=>{let o=e.length,i,s,n=[],c=[],h,g=0,l=!1;for(;g<o;){for(h=t[g];g<o&&(s=e[g],(i=Ba(s))!==void 0);)h+=i+t[++g],l=!0;g!==o&&c.push(s),n.push(h),g++}if(g===o&&n.push(t[o]),l){let a=n.join("$$lit$$");(t=ms.get(a))===void 0&&(n.raw=n,ms.set(a,t=n)),e=c}return r(t,...e)},br=lo(S),Wd=lo(ti),jd=lo(ei);var F=class extends tt{constructor(){super(...arguments),this.assumeInteractionOn=["click"],this.hasSlotController=new yt(this,"[default]","start","end"),this.localize=new st(this),this.invalid=!1,this.isIconButton=!1,this.title="",this.variant="neutral",this.appearance="accent",this.size="medium",this.withCaret=!1,this.withStart=!1,this.withEnd=!1,this.disabled=!1,this.loading=!1,this.pill=!1,this.type="button"}static get validators(){return[...super.validators,ce()]}constructLightDOMButton(){let r=document.createElement("button");for(let t of this.attributes)t.name!=="style"&&r.setAttribute(t.name,t.value);return r.type=this.type,r.style.position="absolute !important",r.style.width="0 !important",r.style.height="0 !important",r.style.clipPath="inset(50%) !important",r.style.overflow="hidden !important",r.style.whiteSpace="nowrap !important",this.name&&(r.name=this.name),r.value=this.value||"",r}handleClick(r){if(this.disabled||this.loading){r.preventDefault(),r.stopImmediatePropagation();return}if(this.type!=="submit"&&this.type!=="reset"||!this.getForm())return;let e=this.constructLightDOMButton();this.parentElement?.append(e),e.click(),e.remove()}handleInvalid(){this.dispatchEvent(new mr)}handleLabelSlotChange(){let r=this.labelSlot.assignedNodes({flatten:!0}),t=!1,e=!1,o=!1,i=!1;[...r].forEach(s=>{if(s.nodeType===Node.ELEMENT_NODE){let n=s;n.localName==="wa-icon"?(e=!0,t||(t=n.label!==void 0)):i=!0}else s.nodeType===Node.TEXT_NODE&&(s.textContent?.trim()||"").length>0&&(o=!0)}),this.isIconButton=e&&!o&&!i,this.customStates.set("icon-button",this.isIconButton),this.isIconButton&&!t&&console.warn('Icon buttons must have a label for screen readers. Add <wa-icon label="..."> to remove this warning.',this)}isButton(){return!this.href}isLink(){return!!this.href}handleDisabledChange(){this.customStates.set("disabled",this.disabled),this.updateValidity()}handleHrefChange(){this.customStates.set("link",this.isLink())}handleLoadingChange(){this.customStates.set("loading",this.loading)}setValue(...r){}click(){this.button.click()}focus(r){this.button.focus(r)}blur(){this.button.blur()}render(){let r=this.isLink(),t=r?ao`a`:ao`button`;return br`
      <${t}
        part="base"
        class=${et({button:!0,caret:this.withCaret,disabled:this.disabled,loading:this.loading,rtl:this.localize.dir()==="rtl","has-label":this.hasSlotController.test("[default]"),"has-start":this.hasUpdated?this.hasSlotController.test("start"):this.withStart,"has-end":this.hasUpdated?this.hasSlotController.test("end"):this.withEnd,"is-icon-button":this.isIconButton})}
        ?disabled=${D(r?void 0:this.disabled)}
        type=${D(r?void 0:this.type)}
        title=${this.title}
        name=${D(r?void 0:this.name)}
        value=${D(r?void 0:this.value)}
        href=${D(r?this.href:void 0)}
        target=${D(r?this.target:void 0)}
        download=${D(r?this.download:void 0)}
        rel=${D(r&&this.rel?this.rel:void 0)}
        role=${D(r?void 0:"button")}
        aria-disabled=${D(r&&this.disabled?"true":void 0)}
        tabindex=${this.disabled?"-1":"0"}
        @invalid=${this.isButton()?this.handleInvalid:null}
        @click=${this.handleClick}
      >
        <slot name="start" part="start" class="start"></slot>
        <slot part="label" class="label" @slotchange=${this.handleLabelSlotChange}></slot>
        <slot name="end" part="end" class="end"></slot>
        ${this.withCaret?br`
                <wa-icon part="caret" class="caret" library="system" name="chevron-down" variant="solid"></wa-icon>
              `:""}
        ${this.loading?br`<wa-spinner part="spinner"></wa-spinner>`:""}
      </${t}>
    `}};F.shadowRootOptions={...tt.shadowRootOptions,delegatesFocus:!0};F.css=[us,le,ht];f([Q(".button")],F.prototype,"button",2);f([Q("slot:not([name])")],F.prototype,"labelSlot",2);f([K()],F.prototype,"invalid",2);f([K()],F.prototype,"isIconButton",2);f([m()],F.prototype,"title",2);f([m({reflect:!0})],F.prototype,"variant",2);f([m({reflect:!0})],F.prototype,"appearance",2);f([m({reflect:!0})],F.prototype,"size",2);f([m({attribute:"with-caret",type:Boolean,reflect:!0})],F.prototype,"withCaret",2);f([m({attribute:"with-start",type:Boolean})],F.prototype,"withStart",2);f([m({attribute:"with-end",type:Boolean})],F.prototype,"withEnd",2);f([m({type:Boolean})],F.prototype,"disabled",2);f([m({type:Boolean,reflect:!0})],F.prototype,"loading",2);f([m({type:Boolean,reflect:!0})],F.prototype,"pill",2);f([m()],F.prototype,"type",2);f([m({reflect:!0})],F.prototype,"name",2);f([m({reflect:!0})],F.prototype,"value",2);f([m({reflect:!0})],F.prototype,"href",2);f([m()],F.prototype,"target",2);f([m()],F.prototype,"rel",2);f([m()],F.prototype,"download",2);f([m({attribute:"formaction"})],F.prototype,"formAction",2);f([m({attribute:"formenctype"})],F.prototype,"formEnctype",2);f([m({attribute:"formmethod"})],F.prototype,"formMethod",2);f([m({attribute:"formnovalidate",type:Boolean})],F.prototype,"formNoValidate",2);f([m({attribute:"formtarget"})],F.prototype,"formTarget",2);f([nt("disabled",{waitUntilFirstUpdate:!0})],F.prototype,"handleDisabledChange",1);f([nt("href")],F.prototype,"handleHrefChange",1);f([nt("loading",{waitUntilFirstUpdate:!0})],F.prototype,"handleLoadingChange",1);F=f([B("wa-button")],F);F.disableWarning?.("change-in-update");var bs=z`
  :host {
    --track-width: 2px;
    --track-color: var(--wa-color-neutral-fill-normal);
    --indicator-color: var(--wa-color-brand-fill-loud);
    --speed: 2s;
    --size: 1em;

    /*
      Resizing a spinner element using anything but font-size will break the animation because the animation uses em
      units. Therefore, if a spinner is used in a flex container without \`flex: none\` applied, the spinner can
      grow/shrink and break the animation. The use of \`flex: none\` on the host element prevents this by always having
      the spinner sized according to its actual dimensions.
    */
    flex: none;
    display: inline-flex;
    width: var(--size);
    height: var(--size);
  }

  svg {
    width: 100%;
    height: 100%;
    aspect-ratio: 1;
    animation: spin var(--speed) linear infinite;
  }

  .track,
  .indicator {
    --radius: calc(var(--size) / 2 - var(--track-width) / 2);
    --circumference: calc(var(--radius) * 2 * 3.141592654);

    cx: calc(var(--size) / 2);
    cy: calc(var(--size) / 2);
    r: var(--radius);
    fill: none;
    stroke-width: var(--track-width);
  }

  .track {
    stroke: var(--track-color);
  }

  .indicator {
    stroke: var(--indicator-color);
    stroke-linecap: round;
    stroke-dasharray: calc(0.597 * var(--circumference)), calc(0.796 * var(--circumference));
    stroke-dashoffset: calc(-0.04 * var(--circumference));
    animation: dash 1.5s ease-in-out infinite;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes dash {
    0% {
      stroke-dasharray: calc(0.008 * var(--circumference)), calc(1.194 * var(--circumference));
      stroke-dashoffset: 0;
    }
    50% {
      stroke-dasharray: calc(0.716 * var(--circumference)), calc(1.194 * var(--circumference));
      stroke-dashoffset: calc(-0.278 * var(--circumference));
    }
    100% {
      stroke-dasharray: calc(0.716 * var(--circumference)), calc(1.194 * var(--circumference));
      stroke-dashoffset: calc(-0.987 * var(--circumference));
    }
  }
`;var co=class extends Z{constructor(){super(...arguments),this.localize=new st(this)}render(){return S`
      <svg
        part="base"
        role="progressbar"
        aria-label=${this.localize.term("loading")}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle class="track" />
        <circle class="indicator" />
      </svg>
    `}};co.css=bs;co=f([B("wa-spinner")],co);var ws=class extends Event{constructor(){super("wa-error",{bubbles:!0,cancelable:!1,composed:!0})}};var vs=class extends Event{constructor(){super("wa-load",{bubbles:!0,cancelable:!1,composed:!0})}};var ys=z`
  :host {
    --primary-color: currentColor;
    --primary-opacity: 1;
    --secondary-color: currentColor;
    --secondary-opacity: 0.4;
    --rotate-angle: 0deg;

    box-sizing: content-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    vertical-align: -0.125em;
  }

  /* Standard */
  :host(:not([auto-width])) {
    width: 1.25em;
    height: 1em;
  }

  /* Auto-width */
  :host([auto-width]) {
    width: auto;
    height: 1em;
  }

  svg {
    height: 1em;
    overflow: visible;
    width: auto;

    /* Duotone colors with path-specific opacity fallback */
    path[data-duotone-primary] {
      color: var(--primary-color);
      opacity: var(--path-opacity, var(--primary-opacity));
    }

    path[data-duotone-secondary] {
      color: var(--secondary-color);
      opacity: var(--path-opacity, var(--secondary-opacity));
    }
  }

  /* Rotation */
  :host([rotate]) {
    transform: rotate(var(--rotate-angle, 0deg));
  }

  /* Flipping */
  :host([flip='x']) {
    transform: scaleX(-1);
  }
  :host([flip='y']) {
    transform: scaleY(-1);
  }
  :host([flip='both']) {
    transform: scale(-1, -1);
  }

  /* Rotation and Flipping combined */
  :host([rotate][flip='x']) {
    transform: rotate(var(--rotate-angle, 0deg)) scaleX(-1);
  }
  :host([rotate][flip='y']) {
    transform: rotate(var(--rotate-angle, 0deg)) scaleY(-1);
  }
  :host([rotate][flip='both']) {
    transform: rotate(var(--rotate-angle, 0deg)) scale(-1, -1);
  }

  /* Animations */
  :host([animation='beat']) {
    animation-name: beat;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='fade']) {
    animation-name: fade;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, cubic-bezier(0.4, 0, 0.6, 1));
  }

  :host([animation='beat-fade']) {
    animation-name: beat-fade;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, cubic-bezier(0.4, 0, 0.6, 1));
  }

  :host([animation='bounce']) {
    animation-name: bounce;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, cubic-bezier(0.28, 0.84, 0.42, 1));
  }

  :host([animation='flip']) {
    animation-name: flip;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='shake']) {
    animation-name: shake;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='spin']) {
    animation-name: spin;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 2s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='spin-pulse']) {
    animation-name: spin-pulse;
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, steps(8));
  }

  :host([animation='spin-reverse']) {
    animation-name: spin;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, reverse);
    animation-duration: var(--animation-duration, 2s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  /* Keyframes */
  @media (prefers-reduced-motion: reduce) {
    :host([animation='beat']),
    :host([animation='bounce']),
    :host([animation='fade']),
    :host([animation='beat-fade']),
    :host([animation='flip']),
    :host([animation='shake']),
    :host([animation='spin']),
    :host([animation='spin-pulse']),
    :host([animation='spin-reverse']) {
      animation: none !important;
      transition: none !important;
    }
  }
  @keyframes beat {
    0%,
    90% {
      transform: scale(1);
    }
    45% {
      transform: scale(var(--beat-scale, 1.25));
    }
  }

  @keyframes fade {
    50% {
      opacity: var(--fade-opacity, 0.4);
    }
  }

  @keyframes beat-fade {
    0%,
    100% {
      opacity: var(--beat-fade-opacity, 0.4);
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(var(--beat-fade-scale, 1.125));
    }
  }

  @keyframes bounce {
    0% {
      transform: scale(1, 1) translateY(0);
    }
    10% {
      transform: scale(var(--bounce-start-scale-x, 1.1), var(--bounce-start-scale-y, 0.9)) translateY(0);
    }
    30% {
      transform: scale(var(--bounce-jump-scale-x, 0.9), var(--bounce-jump-scale-y, 1.1))
        translateY(var(--bounce-height, -0.5em));
    }
    50% {
      transform: scale(var(--bounce-land-scale-x, 1.05), var(--bounce-land-scale-y, 0.95)) translateY(0);
    }
    57% {
      transform: scale(1, 1) translateY(var(--bounce-rebound, -0.125em));
    }
    64% {
      transform: scale(1, 1) translateY(0);
    }
    100% {
      transform: scale(1, 1) translateY(0);
    }
  }

  @keyframes flip {
    50% {
      transform: rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), var(--flip-angle, -180deg));
    }
  }

  @keyframes shake {
    0% {
      transform: rotate(-15deg);
    }
    4% {
      transform: rotate(15deg);
    }
    8%,
    24% {
      transform: rotate(-18deg);
    }
    12%,
    28% {
      transform: rotate(18deg);
    }
    16% {
      transform: rotate(-22deg);
    }
    20% {
      transform: rotate(22deg);
    }
    32% {
      transform: rotate(-12deg);
    }
    36% {
      transform: rotate(12deg);
    }
    40%,
    100% {
      transform: rotate(0deg);
    }
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes spin-pulse {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`;function Na(r){return`data:image/svg+xml,${encodeURIComponent(r)}`}var uo={solid:{check:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M434.8 70.1c14.3 10.4 17.5 30.4 7.1 44.7l-256 352c-5.5 7.6-14 12.3-23.4 13.1s-18.5-2.7-25.1-9.3l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l101.5 101.5 234-321.7c10.4-14.3 30.4-17.5 44.7-7.1z"/></svg>',"chevron-down":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M201.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 338.7 54.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"/></svg>',"chevron-left":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l192 192c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256 246.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-192 192z"/></svg>',"chevron-right":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M311.1 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L243.2 256 73.9 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z"/></svg>',circle:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0z"/></svg>',eyedropper:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M341.6 29.2l-101.6 101.6-9.4-9.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-9.4-9.4 101.6-101.6c39-39 39-102.2 0-141.1s-102.2-39-141.1 0zM55.4 323.3c-15 15-23.4 35.4-23.4 56.6l0 42.4-26.6 39.9c-8.5 12.7-6.8 29.6 4 40.4s27.7 12.5 40.4 4l39.9-26.6 42.4 0c21.2 0 41.6-8.4 56.6-23.4l109.4-109.4-45.3-45.3-109.4 109.4c-3 3-7.1 4.7-11.3 4.7l-36.1 0 0-36.1c0-4.2 1.7-8.3 4.7-11.3l109.4-109.4-45.3-45.3-109.4 109.4z"/></svg>',file:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path fill="currentColor" d="M192 64C156.7 64 128 92.7 128 128L128 512C128 547.3 156.7 576 192 576L448 576C483.3 576 512 547.3 512 512L512 234.5C512 217.5 505.3 201.2 493.3 189.2L386.7 82.7C374.7 70.7 358.5 64 341.5 64L192 64zM453.5 240L360 240C346.7 240 336 229.3 336 216L336 122.5L453.5 240z"/></svg>',"file-audio":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path fill="currentColor" d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM389.8 307.7C380.7 301.4 368.3 303.6 362 312.7C355.7 321.8 357.9 334.2 367 340.5C390.9 357.2 406.4 384.8 406.4 416C406.4 447.2 390.8 474.9 367 491.5C357.9 497.8 355.7 510.3 362 519.3C368.3 528.3 380.8 530.6 389.8 524.3C423.9 500.5 446.4 460.8 446.4 416C446.4 371.2 424 331.5 389.8 307.7zM208 376C199.2 376 192 383.2 192 392L192 440C192 448.8 199.2 456 208 456L232 456L259.2 490C262.2 493.8 266.8 496 271.7 496L272 496C280.8 496 288 488.8 288 480L288 352C288 343.2 280.8 336 272 336L271.7 336C266.8 336 262.2 338.2 259.2 342L232 376L208 376zM336 448.2C336 458.9 346.5 466.4 354.9 459.8C367.8 449.5 376 433.7 376 416C376 398.3 367.8 382.5 354.9 372.2C346.5 365.5 336 373.1 336 383.8L336 448.3z"/></svg>',"file-code":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path fill="currentColor" d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM282.2 359.6C290.8 349.5 289.7 334.4 279.6 325.8C269.5 317.2 254.4 318.3 245.8 328.4L197.8 384.4C190.1 393.4 190.1 406.6 197.8 415.6L245.8 471.6C254.4 481.7 269.6 482.8 279.6 474.2C289.6 465.6 290.8 450.4 282.2 440.4L247.6 400L282.2 359.6zM394.2 328.4C385.6 318.3 370.4 317.2 360.4 325.8C350.4 334.4 349.2 349.6 357.8 359.6L392.4 400L357.8 440.4C349.2 450.5 350.3 465.6 360.4 474.2C370.5 482.8 385.6 481.7 394.2 471.6L442.2 415.6C449.9 406.6 449.9 393.4 442.2 384.4L394.2 328.4z"/></svg>',"file-excel":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path fill="currentColor" d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM292 330.7C284.6 319.7 269.7 316.7 258.7 324C247.7 331.3 244.7 346.3 252 357.3L291.2 416L252 474.7C244.6 485.7 247.6 500.6 258.7 508C269.8 515.4 284.6 512.4 292 501.3L320 459.3L348 501.3C355.4 512.3 370.3 515.3 381.3 508C392.3 500.7 395.3 485.7 388 474.7L348.8 416L388 357.3C395.4 346.3 392.4 331.4 381.3 324C370.2 316.6 355.4 319.6 348 330.7L320 372.7L292 330.7z"/></svg>',"file-image":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path fill="currentColor" d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM256 320C256 302.3 241.7 288 224 288C206.3 288 192 302.3 192 320C192 337.7 206.3 352 224 352C241.7 352 256 337.7 256 320zM220.6 512L419.4 512C435.2 512 448 499.2 448 483.4C448 476.1 445.2 469 440.1 463.7L343.3 361.9C337.3 355.6 328.9 352 320.1 352L319.8 352C311 352 302.7 355.6 296.6 361.9L199.9 463.7C194.8 469 192 476.1 192 483.4C192 499.2 204.8 512 220.6 512z"/></svg>',"file-pdf":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path fill="currentColor" d="M128 64C92.7 64 64 92.7 64 128L64 512C64 547.3 92.7 576 128 576L208 576L208 464C208 428.7 236.7 400 272 400L448 400L448 234.5C448 217.5 441.3 201.2 429.3 189.2L322.7 82.7C310.7 70.7 294.5 64 277.5 64L128 64zM389.5 240L296 240C282.7 240 272 229.3 272 216L272 122.5L389.5 240zM272 444C261 444 252 453 252 464L252 592C252 603 261 612 272 612C283 612 292 603 292 592L292 564L304 564C337.1 564 364 537.1 364 504C364 470.9 337.1 444 304 444L272 444zM304 524L292 524L292 484L304 484C315 484 324 493 324 504C324 515 315 524 304 524zM400 444C389 444 380 453 380 464L380 592C380 603 389 612 400 612L432 612C460.7 612 484 588.7 484 560L484 496C484 467.3 460.7 444 432 444L400 444zM420 572L420 484L432 484C438.6 484 444 489.4 444 496L444 560C444 566.6 438.6 572 432 572L420 572zM508 464L508 592C508 603 517 612 528 612C539 612 548 603 548 592L548 548L576 548C587 548 596 539 596 528C596 517 587 508 576 508L548 508L548 484L576 484C587 484 596 475 596 464C596 453 587 444 576 444L528 444C517 444 508 453 508 464z"/></svg>',"file-powerpoint":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path fill="currentColor" d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM280 320C266.7 320 256 330.7 256 344L256 488C256 501.3 266.7 512 280 512C293.3 512 304 501.3 304 488L304 464L328 464C367.8 464 400 431.8 400 392C400 352.2 367.8 320 328 320L280 320zM328 416L304 416L304 368L328 368C341.3 368 352 378.7 352 392C352 405.3 341.3 416 328 416z"/></svg>',"file-video":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path fill="currentColor" d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM208 368L208 464C208 481.7 222.3 496 240 496L336 496C353.7 496 368 481.7 368 464L368 440L403 475C406.2 478.2 410.5 480 415 480C424.4 480 432 472.4 432 463L432 368.9C432 359.5 424.4 351.9 415 351.9C410.5 351.9 406.2 353.7 403 356.9L368 391.9L368 367.9C368 350.2 353.7 335.9 336 335.9L240 335.9C222.3 335.9 208 350.2 208 367.9z"/></svg>',"file-word":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path fill="currentColor" d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM263.4 338.8C260.5 325.9 247.7 317.7 234.8 320.6C221.9 323.5 213.7 336.3 216.6 349.2L248.6 493.2C250.9 503.7 260 511.4 270.8 512C281.6 512.6 291.4 505.9 294.8 495.6L320 419.9L345.2 495.6C348.6 505.8 358.4 512.5 369.2 512C380 511.5 389.1 503.8 391.4 493.2L423.4 349.2C426.3 336.3 418.1 323.4 405.2 320.6C392.3 317.8 379.4 325.9 376.6 338.8L363.4 398.2L342.8 336.4C339.5 326.6 330.4 320 320 320C309.6 320 300.5 326.6 297.2 336.4L276.6 398.2L263.4 338.8z"/></svg>',"file-zipper":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path fill="currentColor" d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM192 136C192 149.3 202.7 160 216 160L264 160C277.3 160 288 149.3 288 136C288 122.7 277.3 112 264 112L216 112C202.7 112 192 122.7 192 136zM192 232C192 245.3 202.7 256 216 256L264 256C277.3 256 288 245.3 288 232C288 218.7 277.3 208 264 208L216 208C202.7 208 192 218.7 192 232zM256 304L224 304C206.3 304 192 318.3 192 336L192 384C192 410.5 213.5 432 240 432C266.5 432 288 410.5 288 384L288 336C288 318.3 273.7 304 256 304zM240 368C248.8 368 256 375.2 256 384C256 392.8 248.8 400 240 400C231.2 400 224 392.8 224 384C224 375.2 231.2 368 240 368z"/></svg>',"grip-vertical":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M128 40c0-22.1-17.9-40-40-40L40 0C17.9 0 0 17.9 0 40L0 88c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48zm0 192c0-22.1-17.9-40-40-40l-48 0c-22.1 0-40 17.9-40 40l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48zM0 424l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48c0-22.1-17.9-40-40-40l-48 0c-22.1 0-40 17.9-40 40zM320 40c0-22.1-17.9-40-40-40L232 0c-22.1 0-40 17.9-40 40l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48zM192 232l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48c0-22.1-17.9-40-40-40l-48 0c-22.1 0-40 17.9-40 40zM320 424c0-22.1-17.9-40-40-40l-48 0c-22.1 0-40 17.9-40 40l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48z"/></svg>',indeterminate:'<svg part="indeterminate-icon" class="icon" viewBox="0 0 16 16"><g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" stroke-linecap="round"><g stroke="currentColor" stroke-width="2"><g transform="translate(2.285714 6.857143)"><path d="M10.2857143,1.14285714 L1.14285714,1.14285714"/></g></g></g></svg>',minus:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M0 256c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32z"/></svg>',pause:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M48 32C21.5 32 0 53.5 0 80L0 432c0 26.5 21.5 48 48 48l64 0c26.5 0 48-21.5 48-48l0-352c0-26.5-21.5-48-48-48L48 32zm224 0c-26.5 0-48 21.5-48 48l0 352c0 26.5 21.5 48 48 48l64 0c26.5 0 48-21.5 48-48l0-352c0-26.5-21.5-48-48-48l-64 0z"/></svg>',play:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M91.2 36.9c-12.4-6.8-27.4-6.5-39.6 .7S32 57.9 32 72l0 368c0 14.1 7.5 27.2 19.6 34.4s27.2 7.5 39.6 .7l336-184c12.8-7 20.8-20.5 20.8-35.1s-8-28.1-20.8-35.1l-336-184z"/></svg>',plus:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path fill="currentColor" d="M352 128C352 110.3 337.7 96 320 96C302.3 96 288 110.3 288 128L288 288L128 288C110.3 288 96 302.3 96 320C96 337.7 110.3 352 128 352L288 352L288 512C288 529.7 302.3 544 320 544C337.7 544 352 529.7 352 512L352 352L512 352C529.7 352 544 337.7 544 320C544 302.3 529.7 288 512 288L352 288L352 128z"/></svg>',star:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M309.5-18.9c-4.1-8-12.4-13.1-21.4-13.1s-17.3 5.1-21.4 13.1L193.1 125.3 33.2 150.7c-8.9 1.4-16.3 7.7-19.1 16.3s-.5 18 5.8 24.4l114.4 114.5-25.2 159.9c-1.4 8.9 2.3 17.9 9.6 23.2s16.9 6.1 25 2L288.1 417.6 432.4 491c8 4.1 17.7 3.3 25-2s11-14.2 9.6-23.2L441.7 305.9 556.1 191.4c6.4-6.4 8.6-15.8 5.8-24.4s-10.1-14.9-19.1-16.3L383 125.3 309.5-18.9z"/></svg>',upload:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path fill="currentColor" d="M352 173.3L352 384C352 401.7 337.7 416 320 416C302.3 416 288 401.7 288 384L288 173.3L246.6 214.7C234.1 227.2 213.8 227.2 201.3 214.7C188.8 202.2 188.8 181.9 201.3 169.4L297.3 73.4C309.8 60.9 330.1 60.9 342.6 73.4L438.6 169.4C451.1 181.9 451.1 202.2 438.6 214.7C426.1 227.2 405.8 227.2 393.3 214.7L352 173.3zM320 464C364.2 464 400 428.2 400 384L480 384C515.3 384 544 412.7 544 448L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 448C96 412.7 124.7 384 160 384L240 384C240 428.2 275.8 464 320 464zM464 488C477.3 488 488 477.3 488 464C488 450.7 477.3 440 464 440C450.7 440 440 450.7 440 464C440 477.3 450.7 488 464 488z"/></svg>',user:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M224 248a120 120 0 1 0 0-240 120 120 0 1 0 0 240zm-29.7 56C95.8 304 16 383.8 16 482.3 16 498.7 29.3 512 45.7 512l356.6 0c16.4 0 29.7-13.3 29.7-29.7 0-98.5-79.8-178.3-178.3-178.3l-59.4 0z"/></svg>',xmark:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M55.1 73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L147.2 256 9.9 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192.5 301.3 329.9 438.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.8 256 375.1 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192.5 210.7 55.1 73.4z"/></svg>'},regular:{"circle-question":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M464 256a208 208 0 1 0 -416 0 208 208 0 1 0 416 0zM0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0zm256-80c-17.7 0-32 14.3-32 32 0 13.3-10.7 24-24 24s-24-10.7-24-24c0-44.2 35.8-80 80-80s80 35.8 80 80c0 47.2-36 67.2-56 74.5l0 3.8c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-8.1c0-20.5 14.8-35.2 30.1-40.2 6.4-2.1 13.2-5.5 18.2-10.3 4.3-4.2 7.7-10 7.7-19.6 0-17.7-14.3-32-32-32zM224 368a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg>',"circle-xmark":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464a256 256 0 1 0 0-512 256 256 0 1 0 0 512zM167 167c-9.4 9.4-9.4 24.6 0 33.9l55 55-55 55c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l55-55 55 55c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-55-55 55-55c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-55 55-55-55c-9.4-9.4-24.6-9.4-33.9 0z"/></svg>',copy:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M384 336l-192 0c-8.8 0-16-7.2-16-16l0-256c0-8.8 7.2-16 16-16l133.5 0c4.2 0 8.3 1.7 11.3 4.7l58.5 58.5c3 3 4.7 7.1 4.7 11.3L400 320c0 8.8-7.2 16-16 16zM192 384l192 0c35.3 0 64-28.7 64-64l0-197.5c0-17-6.7-33.3-18.7-45.3L370.7 18.7C358.7 6.7 342.5 0 325.5 0L192 0c-35.3 0-64 28.7-64 64l0 256c0 35.3 28.7 64 64 64zM64 128c-35.3 0-64 28.7-64 64L0 448c0 35.3 28.7 64 64 64l192 0c35.3 0 64-28.7 64-64l0-16-48 0 0 16c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16l0-256c0-8.8 7.2-16 16-16l16 0 0-48-16 0z"/></svg>',eye:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M288 80C222.8 80 169.2 109.6 128.1 147.7 89.6 183.5 63 226 49.4 256 63 286 89.6 328.5 128.1 364.3 169.2 402.4 222.8 432 288 432s118.8-29.6 159.9-67.7C486.4 328.5 513 286 526.6 256 513 226 486.4 183.5 447.9 147.7 406.8 109.6 353.2 80 288 80zM95.4 112.6C142.5 68.8 207.2 32 288 32s145.5 36.8 192.6 80.6c46.8 43.5 78.1 95.4 93 131.1 3.3 7.9 3.3 16.7 0 24.6-14.9 35.7-46.2 87.7-93 131.1-47.1 43.7-111.8 80.6-192.6 80.6S142.5 443.2 95.4 399.4c-46.8-43.5-78.1-95.4-93-131.1-3.3-7.9-3.3-16.7 0-24.6 14.9-35.7 46.2-87.7 93-131.1zM288 336c44.2 0 80-35.8 80-80 0-29.6-16.1-55.5-40-69.3-1.4 59.7-49.6 107.9-109.3 109.3 13.8 23.9 39.7 40 69.3 40zm-79.6-88.4c2.5 .3 5 .4 7.6 .4 35.3 0 64-28.7 64-64 0-2.6-.2-5.1-.4-7.6-37.4 3.9-67.2 33.7-71.1 71.1zm45.6-115c10.8-3 22.2-4.5 33.9-4.5 8.8 0 17.5 .9 25.8 2.6 .3 .1 .5 .1 .8 .2 57.9 12.2 101.4 63.7 101.4 125.2 0 70.7-57.3 128-128 128-61.6 0-113-43.5-125.2-101.4-1.8-8.6-2.8-17.5-2.8-26.6 0-11 1.4-21.8 4-32 .2-.7 .3-1.3 .5-1.9 11.9-43.4 46.1-77.6 89.5-89.5z"/></svg>',"eye-slash":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M41-24.9c-9.4-9.4-24.6-9.4-33.9 0S-2.3-.3 7 9.1l528 528c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-96.4-96.4c2.7-2.4 5.4-4.8 8-7.2 46.8-43.5 78.1-95.4 93-131.1 3.3-7.9 3.3-16.7 0-24.6-14.9-35.7-46.2-87.7-93-131.1-47.1-43.7-111.8-80.6-192.6-80.6-56.8 0-105.6 18.2-146 44.2L41-24.9zM176.9 111.1c32.1-18.9 69.2-31.1 111.1-31.1 65.2 0 118.8 29.6 159.9 67.7 38.5 35.7 65.1 78.3 78.6 108.3-13.6 30-40.2 72.5-78.6 108.3-3.1 2.8-6.2 5.6-9.4 8.4L393.8 328c14-20.5 22.2-45.3 22.2-72 0-70.7-57.3-128-128-128-26.7 0-51.5 8.2-72 22.2l-39.1-39.1zm182 182l-108-108c11.1-5.8 23.7-9.1 37.1-9.1 44.2 0 80 35.8 80 80 0 13.4-3.3 26-9.1 37.1zM103.4 173.2l-34-34c-32.6 36.8-55 75.8-66.9 104.5-3.3 7.9-3.3 16.7 0 24.6 14.9 35.7 46.2 87.7 93 131.1 47.1 43.7 111.8 80.6 192.6 80.6 37.3 0 71.2-7.9 101.5-20.6L352.2 422c-20 6.4-41.4 10-64.2 10-65.2 0-118.8-29.6-159.9-67.7-38.5-35.7-65.1-78.3-78.6-108.3 10.4-23.1 28.6-53.6 54-82.8z"/></svg>',star:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path fill="currentColor" d="M288.1-32c9 0 17.3 5.1 21.4 13.1L383 125.3 542.9 150.7c8.9 1.4 16.3 7.7 19.1 16.3s.5 18-5.8 24.4L441.7 305.9 467 465.8c1.4 8.9-2.3 17.9-9.6 23.2s-17 6.1-25 2L288.1 417.6 143.8 491c-8 4.1-17.7 3.3-25-2s-11-14.2-9.6-23.2L134.4 305.9 20 191.4c-6.4-6.4-8.6-15.8-5.8-24.4s10.1-14.9 19.1-16.3l159.9-25.4 73.6-144.2c4.1-8 12.4-13.1 21.4-13.1zm0 76.8L230.3 158c-3.5 6.8-10 11.6-17.6 12.8l-125.5 20 89.8 89.9c5.4 5.4 7.9 13.1 6.7 20.7l-19.8 125.5 113.3-57.6c6.8-3.5 14.9-3.5 21.8 0l113.3 57.6-19.8-125.5c-1.2-7.6 1.3-15.3 6.7-20.7l89.8-89.9-125.5-20c-7.6-1.2-14.1-6-17.6-12.8L288.1 44.8z"/></svg>'}},Va={name:"system",resolver:(r,t="classic",e="solid")=>{let i=uo[e][r]??uo.regular[r]??uo.regular["circle-question"];return i?Na(i):""}},xs=Va;var Ua="",ho="";function Cs(){return Ua.replace(/\/$/,"")}function Ha(r){ho=r}function _s(){if(!ho){let r=document.querySelector("[data-fa-kit-code]");r&&Ha(r.getAttribute("data-fa-kit-code")||"")}return ho}var ks="7.2.0";function Wa(r,t,e){let o="solid";return t==="chisel"&&(o="chisel-regular"),t==="etch"&&(o="etch-solid"),t==="graphite"&&(o="graphite-thin"),t==="jelly"&&(o="jelly-regular",e==="duo-regular"&&(o="jelly-duo-regular"),e==="fill-regular"&&(o="jelly-fill-regular")),t==="jelly-duo"&&(o="jelly-duo-regular"),t==="jelly-fill"&&(o="jelly-fill-regular"),t==="notdog"&&(e==="solid"&&(o="notdog-solid"),e==="duo-solid"&&(o="notdog-duo-solid")),t==="notdog-duo"&&(o="notdog-duo-solid"),t==="slab"&&((e==="solid"||e==="regular")&&(o="slab-regular"),e==="press-regular"&&(o="slab-press-regular")),t==="slab-press"&&(o="slab-press-regular"),t==="thumbprint"&&(o="thumbprint-light"),t==="utility"&&(o="utility-semibold"),t==="utility-duo"&&(o="utility-duo-semibold"),t==="utility-fill"&&(o="utility-fill-semibold"),t==="whiteboard"&&(o="whiteboard-semibold"),t==="classic"&&(e==="thin"&&(o="thin"),e==="light"&&(o="light"),e==="regular"&&(o="regular"),e==="solid"&&(o="solid")),t==="duotone"&&(e==="thin"&&(o="duotone-thin"),e==="light"&&(o="duotone-light"),e==="regular"&&(o="duotone-regular"),e==="solid"&&(o="duotone")),t==="sharp"&&(e==="thin"&&(o="sharp-thin"),e==="light"&&(o="sharp-light"),e==="regular"&&(o="sharp-regular"),e==="solid"&&(o="sharp-solid")),t==="sharp-duotone"&&(e==="thin"&&(o="sharp-duotone-thin"),e==="light"&&(o="sharp-duotone-light"),e==="regular"&&(o="sharp-duotone-regular"),e==="solid"&&(o="sharp-duotone-solid")),t==="brands"&&(o="brands"),o}function ja(r,t,e){let o=Wa(r,t,e),i=Cs();if(i)return`${i}/${o}/${r}.svg`;let s=_s();return s.length>0?`https://ka-p.fontawesome.com/releases/v${ks}/svgs/${o}/${r}.svg?token=${encodeURIComponent(s)}`:`https://ka-f.fontawesome.com/releases/v${ks}/svgs/${o}/${r}.svg`}var Ya={name:"default",resolver:(r,t="classic",e="solid")=>ja(r,t,e),mutator:(r,t)=>{if(t?.family&&!r.hasAttribute("data-duotone-initialized")){let{family:e,variant:o}=t;if(e==="duotone"||e==="sharp-duotone"||e==="notdog-duo"||e==="notdog"&&o==="duo-solid"||e==="jelly-duo"||e==="jelly"&&o==="duo-regular"||e==="utility-duo"||e==="thumbprint"){let i=[...r.querySelectorAll("path")],s=i.find(c=>!c.hasAttribute("opacity")),n=i.find(c=>c.hasAttribute("opacity"));if(!s||!n)return;if(s.setAttribute("data-duotone-primary",""),n.setAttribute("data-duotone-secondary",""),t.swapOpacity&&s&&n){let c=n.getAttribute("opacity")||"0.4";s.style.setProperty("--path-opacity",c),n.style.setProperty("--path-opacity","1")}r.setAttribute("data-duotone-initialized","")}}}},Ss=Ya;var Ka="classic",Ga=[Ss,xs],po=[];function Es(r){po.push(r)}function $s(r){po=po.filter(t=>t!==r)}function wr(r){return Ga.find(t=>t.name===r)}function As(){return Ka}var{I:Ip}=ii;var Ls=(r,t)=>t===void 0?r?._$litType$!==void 0:r?._$litType$===t;var Rs=r=>r.strings===void 0;var Za={},Ts=(r,t=Za)=>r._$AH=t;var De=Symbol(),vr=Symbol(),fo,mo=new Map,rt=class extends Z{constructor(){super(...arguments),this.svg=null,this.autoWidth=!1,this.swapOpacity=!1,this.label="",this.library="default",this.rotate=0,this.resolveIcon=async(r,t)=>{let e;if(t?.spriteSheet){this.hasUpdated||await this.updateComplete,this.svg=S`<svg part="svg">
        <use part="use" href="${r}"></use>
      </svg>`,await this.updateComplete;let o=this.shadowRoot.querySelector("[part='svg']");return typeof t.mutator=="function"&&t.mutator(o,this),this.svg}try{if(e=await fetch(r,{mode:"cors"}),!e.ok)return e.status===410?De:vr}catch{return vr}try{let o=document.createElement("div");o.innerHTML=await e.text();let i=o.firstElementChild;if(i?.tagName?.toLowerCase()!=="svg")return De;fo||(fo=new DOMParser);let n=fo.parseFromString(i.outerHTML,"text/html").body.querySelector("svg");return n?(n.part.add("svg"),document.adoptNode(n)):De}catch{return De}}}connectedCallback(){super.connectedCallback(),Es(this)}firstUpdated(r){super.firstUpdated(r),this.hasAttribute("rotate")&&this.style.setProperty("--rotate-angle",`${this.rotate}deg`),this.setIcon()}disconnectedCallback(){super.disconnectedCallback(),$s(this)}async getIconSource(){let r=wr(this.library),t=this.family||As();if(this.name&&r){let e;try{e=await r.resolver(this.name,t,this.variant,this.autoWidth)}catch{e=void 0}return{url:e,fromLibrary:!0}}return{url:this.src,fromLibrary:!1}}handleLabelChange(){typeof this.label=="string"&&this.label.length>0?(this.setAttribute("role","img"),this.setAttribute("aria-label",this.label),this.removeAttribute("aria-hidden")):(this.removeAttribute("role"),this.removeAttribute("aria-label"),this.setAttribute("aria-hidden","true"))}async setIcon(){let{url:r,fromLibrary:t}=await this.getIconSource(),e=t?wr(this.library):void 0;if(!r){this.svg=null;return}let o=mo.get(r);o||(o=this.resolveIcon(r,e),mo.set(r,o));let i=await o;i===vr&&mo.delete(r);let s=await this.getIconSource();if(r===s.url){if(Ls(i)){this.svg=i;return}switch(i){case vr:case De:this.svg=null,this.dispatchEvent(new ws);break;default:this.svg=i.cloneNode(!0),e?.mutator?.(this.svg,this),this.dispatchEvent(new vs)}}}updated(r){super.updated(r);let t=wr(this.library);this.hasAttribute("rotate")&&this.style.setProperty("--rotate-angle",`${this.rotate}deg`);let e=this.shadowRoot?.querySelector("svg");e&&t?.mutator?.(e,this)}render(){return this.hasUpdated?this.svg:S`<svg part="svg" width="16" height="16"></svg>`}};rt.css=ys;f([K()],rt.prototype,"svg",2);f([m({reflect:!0})],rt.prototype,"name",2);f([m({reflect:!0})],rt.prototype,"family",2);f([m({reflect:!0})],rt.prototype,"variant",2);f([m({attribute:"auto-width",type:Boolean,reflect:!0})],rt.prototype,"autoWidth",2);f([m({attribute:"swap-opacity",type:Boolean,reflect:!0})],rt.prototype,"swapOpacity",2);f([m()],rt.prototype,"src",2);f([m()],rt.prototype,"label",2);f([m({reflect:!0})],rt.prototype,"library",2);f([m({type:Number,reflect:!0})],rt.prototype,"rotate",2);f([m({type:String,reflect:!0})],rt.prototype,"flip",2);f([m({type:String,reflect:!0})],rt.prototype,"animation",2);f([nt("label")],rt.prototype,"handleLabelChange",1);f([nt(["family","name","library","variant","src","autoWidth","swapOpacity"],{waitUntilFirstUpdate:!0})],rt.prototype,"setIcon",1);rt=f([B("wa-icon")],rt);var zs=z`
  :host {
    --spacing: var(--wa-space-l);

    /* Internal calculated properties */
    --inner-border-radius: calc(var(--wa-panel-border-radius) - var(--wa-panel-border-width));

    display: flex;
    flex-direction: column;
    background-color: var(--wa-color-surface-default);
    border-color: var(--wa-color-surface-border);
    border-radius: var(--wa-panel-border-radius);
    border-style: var(--wa-panel-border-style);
    box-shadow: var(--wa-shadow-s);
    border-width: var(--wa-panel-border-width);
    color: var(--wa-color-text-normal);
  }

  /* Appearance modifiers */
  :host([appearance='plain']) {
    background-color: transparent;
    border-color: transparent;
    box-shadow: none;
  }

  :host([appearance='outlined']) {
    background-color: var(--wa-color-surface-default);
    border-color: var(--wa-color-surface-border);
  }

  :host([appearance='filled']) {
    background-color: var(--wa-color-neutral-fill-quiet);
    border-color: transparent;
  }

  :host([appearance='filled-outlined']) {
    background-color: var(--wa-color-neutral-fill-quiet);
    border-color: var(--wa-color-surface-border);
  }

  :host([appearance='accent']) {
    color: var(--wa-color-neutral-on-loud);
    background-color: var(--wa-color-neutral-fill-loud);
    border-color: transparent;
  }

  /* Take care of top and bottom radii */
  .media,
  :host(:not([with-media])) .header,
  :host(:not([with-media], [with-header])) .body {
    border-start-start-radius: var(--inner-border-radius);
    border-start-end-radius: var(--inner-border-radius);
  }

  :host(:not([with-footer])) .body,
  .footer {
    border-end-start-radius: var(--inner-border-radius);
    border-end-end-radius: var(--inner-border-radius);
  }

  .media {
    display: flex;
    overflow: hidden;

    &::slotted(*) {
      display: block;
      width: 100%;
      border-radius: 0 !important;
    }
  }

  /* Round all corners for plain appearance */
  :host([appearance='plain']) .media {
    border-radius: var(--inner-border-radius);

    &::slotted(*) {
      border-radius: inherit !important;
    }
  }

  .header {
    display: block;
    border-block-end-style: inherit;
    border-block-end-color: var(--wa-color-surface-border);
    border-block-end-width: var(--wa-panel-border-width);
    padding: calc(var(--spacing) / 2) var(--spacing);
  }

  .body {
    display: block;
    padding: var(--spacing);
  }

  .footer {
    display: block;
    border-block-start-style: inherit;
    border-block-start-color: var(--wa-color-surface-border);
    border-block-start-width: var(--wa-panel-border-width);
    padding: var(--spacing);
  }

  /* Push slots to sides when the action slots renders */
  .has-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  :host(:not([with-header])) .header,
  :host(:not([with-footer])) .footer,
  :host(:not([with-media])) .media {
    display: none;
  }

  /* Orientation Styles */
  :host([orientation='horizontal']) {
    flex-direction: row;

    .media {
      border-start-start-radius: var(--inner-border-radius);
      border-end-start-radius: var(--inner-border-radius);
      border-start-end-radius: 0;

      &::slotted(*) {
        block-size: 100%;
        inline-size: 100%;
        object-fit: cover;
      }
    }
  }

  :host([orientation='horizontal']) .body slot::slotted(*) {
    display: block;
    height: 100%;
    margin: 0;
  }

  :host([orientation='horizontal']) slot[name='actions']::slotted(*) {
    display: flex;
    align-items: center;
    padding: var(--spacing);
  }
`;var xt=class extends Z{constructor(){super(...arguments),this.hasSlotController=new yt(this,"footer","header","media","header-actions","footer-actions","actions"),this.appearance="outlined",this.withHeader=!1,this.withMedia=!1,this.withFooter=!1,this.orientation="vertical"}willUpdate(){!this.withHeader&&this.hasSlotController.test("header")&&(this.withHeader=!0),!this.withMedia&&this.hasSlotController.test("media")&&(this.withMedia=!0),!this.withFooter&&this.hasSlotController.test("footer")&&(this.withFooter=!0)}render(){return this.orientation==="horizontal"?S`
        <slot name="media" part="media" class="media"></slot>
        <div part="body" class="body"><slot></slot></div>
        <slot name="actions" part="actions" class="actions"></slot>
      `:S`
      <slot name="media" part="media" class="media"></slot>

      ${this.hasSlotController.test("header-actions")?S` <header part="header" class="header has-actions">
            <slot name="header"></slot>
            <slot name="header-actions"></slot>
          </header>`:S` <header part="header" class="header">
            <slot name="header"></slot>
          </header>`}

      <div part="body" class="body"><slot></slot></div>
      ${this.hasSlotController.test("footer-actions")?S` <footer part="footer" class="footer has-actions">
            <slot name="footer"></slot>
            <slot name="footer-actions"></slot>
          </footer>`:S` <footer part="footer" class="footer">
            <slot name="footer"></slot>
          </footer>`}
    `}};xt.css=[ht,zs];f([m({reflect:!0})],xt.prototype,"appearance",2);f([m({attribute:"with-header",type:Boolean,reflect:!0})],xt.prototype,"withHeader",2);f([m({attribute:"with-media",type:Boolean,reflect:!0})],xt.prototype,"withMedia",2);f([m({attribute:"with-footer",type:Boolean,reflect:!0})],xt.prototype,"withFooter",2);f([m({reflect:!0})],xt.prototype,"orientation",2);xt=f([B("wa-card")],xt);xt.disableWarning?.("change-in-update");var yr=class extends Event{constructor(){super("wa-clear",{bubbles:!0,cancelable:!1,composed:!0})}};function Os(r,t){let e=r.metaKey||r.ctrlKey||r.shiftKey||r.altKey;r.key==="Enter"&&!e&&setTimeout(()=>{!r.defaultPrevented&&!r.isComposing&&Xa(t)})}function Xa(r){let t=null;if("form"in r&&(t=r.form),!t&&"getForm"in r&&(t=r.getForm()),!t)return;let e=[...t.elements];if(e.length===1){t.requestSubmit(null);return}let o=e.find(i=>i.type==="submit"&&!i.matches(":disabled"));o&&(["input","button"].includes(o.localName)?t.requestSubmit(o):o.click())}var Ps=z`
  :host {
    border-width: 0;
  }

  :host(:focus) {
    outline: none;
  }

  .text-field {
    display: flex;
    align-items: stretch;
    justify-content: start;
    position: relative;
    transition: inherit;
    height: var(--wa-form-control-height);
    border-color: var(--wa-form-control-border-color);
    border-radius: var(--wa-form-control-border-radius);
    border-style: var(--wa-form-control-border-style);
    border-width: var(--wa-form-control-border-width);
    cursor: text;
    color: var(--wa-form-control-value-color);
    font-size: var(--wa-form-control-value-font-size);
    font-family: inherit;
    font-weight: var(--wa-form-control-value-font-weight);
    line-height: var(--wa-form-control-value-line-height);
    vertical-align: middle;
    width: 100%;
    transition:
      background-color var(--wa-transition-normal),
      border-color var(--wa-transition-normal),
      outline-color var(--wa-transition-fast);
    transition-timing-function: var(--wa-transition-easing);
    background-color: var(--wa-form-control-background-color);
    box-shadow: var(--box-shadow);
    padding: 0 var(--wa-form-control-padding-inline);
    outline: var(--wa-focus-ring-style) var(--wa-focus-ring-width) transparent;
    outline-offset: var(--wa-focus-ring-offset);

    &:focus-within {
      outline-color: var(--wa-color-focus);
    }

    /* Style disabled inputs */
    &:has(:disabled) {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  /* Appearance modifiers */
  :host([appearance='outlined']) .text-field {
    background-color: var(--wa-form-control-background-color);
    border-color: var(--wa-form-control-border-color);
  }

  :host([appearance='filled']) .text-field {
    background-color: var(--wa-color-neutral-fill-quiet);
    border-color: var(--wa-color-neutral-fill-quiet);
  }

  :host([appearance='filled-outlined']) .text-field {
    background-color: var(--wa-color-neutral-fill-quiet);
    border-color: var(--wa-form-control-border-color);
  }

  :host([pill]) .text-field {
    border-radius: var(--wa-border-radius-pill) !important;
  }

  .text-field {
    /* Show autofill styles over the entire text field, not just the native <input> */
    &:has(:autofill),
    &:has(:-webkit-autofill) {
      background-color: var(--wa-color-brand-fill-quiet) !important;
    }

    input,
    textarea {
      /*
      Fixes an alignment issue with placeholders.
      https://github.com/shoelace-style/webawesome/issues/342
    */
      height: 100%;

      padding: 0;
      border: none;
      outline: none;
      box-shadow: none;
      margin: 0;
      cursor: inherit;
      -webkit-appearance: none;
      font: inherit;

      /* Turn off Safari's autofill styles */
      &:-webkit-autofill,
      &:-webkit-autofill:hover,
      &:-webkit-autofill:focus,
      &:-webkit-autofill:active {
        -webkit-background-clip: text;
        background-color: transparent;
        -webkit-text-fill-color: inherit;
      }
    }
  }

  input {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    transition: inherit;

    /* prettier-ignore */
    background-color: rgb(118 118 118 / 0); /* ensures proper placeholder styles in webkit's date input */
    height: calc(var(--wa-form-control-height) - var(--border-width) * 2);
    padding-block: 0;
    color: inherit;

    &:autofill {
      &,
      &:hover,
      &:focus,
      &:active {
        box-shadow: none;
        caret-color: var(--wa-form-control-value-color);
      }
    }

    &::placeholder {
      color: var(--wa-form-control-placeholder-color);
      user-select: none;
      -webkit-user-select: none;
    }

    &::-webkit-search-decoration,
    &::-webkit-search-cancel-button,
    &::-webkit-search-results-button,
    &::-webkit-search-results-decoration {
      -webkit-appearance: none;
    }

    &:focus {
      outline: none;
    }
  }

  textarea {
    &:autofill {
      &,
      &:hover,
      &:focus,
      &:active {
        box-shadow: none;
        caret-color: var(--wa-form-control-value-color);
      }
    }

    &::placeholder {
      color: var(--wa-form-control-placeholder-color);
      user-select: none;
      -webkit-user-select: none;
    }
  }

  .start,
  .end {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    cursor: default;

    &::slotted(wa-icon) {
      color: var(--wa-color-neutral-on-quiet);
    }
  }

  .start::slotted(*) {
    margin-inline-end: var(--wa-form-control-padding-inline);
  }

  .end::slotted(*) {
    margin-inline-start: var(--wa-form-control-padding-inline);
  }

  /*
   * Clearable + Password Toggle
   */

  .clear,
  .password-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: inherit;
    color: var(--wa-color-neutral-on-quiet);
    border: none;
    background: none;
    padding: 0;
    transition: var(--wa-transition-normal) color;
    cursor: pointer;
    margin-inline-start: var(--wa-form-control-padding-inline);

    @media (hover: hover) {
      &:hover {
        color: color-mix(in oklab, currentColor, var(--wa-color-mix-hover));
      }
    }

    &:active {
      color: color-mix(in oklab, currentColor, var(--wa-color-mix-active));
    }

    &:focus {
      outline: none;
    }
  }

  /* Don't show the browser's password toggle in Edge */
  ::-ms-reveal {
    display: none;
  }

  /* Hide the built-in number spinner */
  :host([without-spin-buttons]) input[type='number'] {
    -moz-appearance: textfield;

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
      display: none;
    }
  }
`;var he=z`
  :host {
    display: flex;
    flex-direction: column;
  }

  /* Treat wrapped labels, inputs, and hints as direct children of the host element */
  [part~='form-control'] {
    display: contents;
  }

  /* Label */
  :is([part~='form-control-label'], [part~='label']):has(*:not(:empty)),
  :is([part~='form-control-label'], [part~='label']).has-label {
    display: inline-flex;
    color: var(--wa-form-control-label-color);
    font-weight: var(--wa-form-control-label-font-weight);
    line-height: var(--wa-form-control-label-line-height);
    margin-block-end: 0.5em;
  }

  :host([required]) :is([part~='form-control-label'], [part~='label'])::after {
    content: var(--wa-form-control-required-content);
    margin-inline-start: var(--wa-form-control-required-content-offset);
    color: var(--wa-form-control-required-content-color);
  }

  /* Help text */
  [part~='hint'] {
    display: block;
    color: var(--wa-form-control-hint-color);
    font-weight: var(--wa-form-control-hint-font-weight);
    line-height: var(--wa-form-control-hint-line-height);
    margin-block-start: 0.5em;
    font-size: var(--wa-font-size-smaller);

    &:not(.has-slotted, .has-hint) {
      display: none;
    }
  }
`;var xr=ae(class extends It{constructor(r){if(super(r),r.type!==ft.PROPERTY&&r.type!==ft.ATTRIBUTE&&r.type!==ft.BOOLEAN_ATTRIBUTE)throw Error("The `live` directive is not allowed on child or event bindings");if(!Rs(r))throw Error("`live` bindings can only contain a single expression")}render(r){return r}update(r,[t]){if(t===ot||t===Y)return t;let e=r.element,o=r.name;if(r.type===ft.PROPERTY){if(t===e[o])return ot}else if(r.type===ft.BOOLEAN_ATTRIBUTE){if(!!t===e.hasAttribute(o))return ot}else if(r.type===ft.ATTRIBUTE&&e.getAttribute(o)===t+"")return ot;return Ts(r),t}});var O=class extends tt{constructor(){super(...arguments),this.assumeInteractionOn=["blur","input"],this.hasSlotController=new yt(this,"hint","label"),this.localize=new st(this),this.title="",this.type="text",this._value=null,this.defaultValue=this.getAttribute("value")||null,this.size="medium",this.appearance="outlined",this.pill=!1,this.label="",this.hint="",this.withClear=!1,this.placeholder="",this.readonly=!1,this.passwordToggle=!1,this.passwordVisible=!1,this.withoutSpinButtons=!1,this.required=!1,this.spellcheck=!0,this.withLabel=!1,this.withHint=!1}static get validators(){return[...super.validators,ce()]}get value(){return this.valueHasChanged?this._value:this._value??this.defaultValue}set value(r){this._value!==r&&(this.valueHasChanged=!0,this._value=r)}handleChange(r){this.value=this.input.value,this.relayNativeEvent(r,{bubbles:!0,composed:!0})}handleClearClick(r){r.preventDefault(),this.value!==""&&(this.value="",this.updateComplete.then(()=>{this.dispatchEvent(new yr),this.dispatchEvent(new InputEvent("input",{bubbles:!0,composed:!0})),this.dispatchEvent(new Event("change",{bubbles:!0,composed:!0}))})),this.input.focus()}handleInput(){this.value=this.input.value}handleKeyDown(r){Os(r,this)}handlePasswordToggle(){this.passwordVisible=!this.passwordVisible}updated(r){super.updated(r),(r.has("value")||r.has("defaultValue"))&&(this.customStates.set("blank",!this.value),this.updateValidity())}handleStepChange(){this.input.step=String(this.step),this.updateValidity()}focus(r){this.input.focus(r)}blur(){this.input.blur()}select(){this.input.select()}setSelectionRange(r,t,e="none"){this.input.setSelectionRange(r,t,e)}setRangeText(r,t,e,o="preserve"){let i=t??this.input.selectionStart,s=e??this.input.selectionEnd;this.input.setRangeText(r,i,s,o),this.value!==this.input.value&&(this.value=this.input.value)}showPicker(){"showPicker"in HTMLInputElement.prototype&&this.input.showPicker()}stepUp(){this.input.stepUp(),this.value!==this.input.value&&(this.value=this.input.value)}stepDown(){this.input.stepDown(),this.value!==this.input.value&&(this.value=this.input.value)}formResetCallback(){this.value=null,this.input&&(this.input.value=this.value),super.formResetCallback()}render(){let r=this.hasUpdated?this.hasSlotController.test("label"):this.withLabel,t=this.hasUpdated?this.hasSlotController.test("hint"):this.withHint,e=this.label?!0:!!r,o=this.hint?!0:!!t,i=this.withClear&&!this.disabled&&!this.readonly,s=i&&(typeof this.value=="number"||this.value&&this.value.length>0);return S`
      <label
        part="form-control-label label"
        class=${et({label:!0,"has-label":e})}
        for="input"
        aria-hidden=${e?"false":"true"}
      >
        <slot name="label">${this.label}</slot>
      </label>

      <div part="base" class="text-field">
        <slot name="start" part="start" class="start"></slot>

        <input
          part="input"
          id="input"
          class="control"
          type=${this.type==="password"&&this.passwordVisible?"text":this.type}
          title=${this.title}
          name=${D(this.name)}
          ?disabled=${this.disabled}
          ?readonly=${this.readonly}
          ?required=${this.required}
          placeholder=${D(this.placeholder)}
          minlength=${D(this.minlength)}
          maxlength=${D(this.maxlength)}
          min=${D(this.min)}
          max=${D(this.max)}
          step=${D(this.step)}
          .value=${xr(this.value??"")}
          autocapitalize=${D(this.autocapitalize)}
          autocomplete=${D(this.autocomplete)}
          autocorrect=${this.autocorrect?"on":"off"}
          ?autofocus=${this.autofocus}
          spellcheck=${this.spellcheck}
          pattern=${D(this.pattern)}
          enterkeyhint=${D(this.enterkeyhint)}
          inputmode=${D(this.inputmode)}
          aria-describedby="hint"
          @change=${this.handleChange}
          @input=${this.handleInput}
          @keydown=${this.handleKeyDown}
        />

        ${s?S`
              <button
                part="clear-button"
                class="clear"
                type="button"
                aria-label=${this.localize.term("clearEntry")}
                @click=${this.handleClearClick}
                tabindex="-1"
              >
                <slot name="clear-icon">
                  <wa-icon name="circle-xmark" library="system" variant="regular"></wa-icon>
                </slot>
              </button>
            `:""}
        ${this.passwordToggle&&!this.disabled?S`
              <button
                part="password-toggle-button"
                class="password-toggle"
                type="button"
                aria-label=${this.localize.term(this.passwordVisible?"hidePassword":"showPassword")}
                @click=${this.handlePasswordToggle}
                tabindex="-1"
              >
                ${this.passwordVisible?S`
                      <slot name="hide-password-icon">
                        <wa-icon name="eye-slash" library="system" variant="regular"></wa-icon>
                      </slot>
                    `:S`
                      <slot name="show-password-icon">
                        <wa-icon name="eye" library="system" variant="regular"></wa-icon>
                      </slot>
                    `}
              </button>
            `:""}

        <slot name="end" part="end" class="end"></slot>
      </div>

      <slot
        id="hint"
        part="hint"
        name="hint"
        class=${et({"has-slotted":o})}
        aria-hidden=${o?"false":"true"}
        >${this.hint}</slot
      >
    `}};O.css=[ht,he,Ps];O.shadowRootOptions={...tt.shadowRootOptions,delegatesFocus:!0};f([Q("input")],O.prototype,"input",2);f([m()],O.prototype,"title",2);f([m({reflect:!0})],O.prototype,"type",2);f([K()],O.prototype,"value",1);f([m({attribute:"value",reflect:!0})],O.prototype,"defaultValue",2);f([m({reflect:!0})],O.prototype,"size",2);f([m({reflect:!0})],O.prototype,"appearance",2);f([m({type:Boolean,reflect:!0})],O.prototype,"pill",2);f([m()],O.prototype,"label",2);f([m({attribute:"hint"})],O.prototype,"hint",2);f([m({attribute:"with-clear",type:Boolean})],O.prototype,"withClear",2);f([m()],O.prototype,"placeholder",2);f([m({type:Boolean,reflect:!0})],O.prototype,"readonly",2);f([m({attribute:"password-toggle",type:Boolean})],O.prototype,"passwordToggle",2);f([m({attribute:"password-visible",type:Boolean})],O.prototype,"passwordVisible",2);f([m({attribute:"without-spin-buttons",type:Boolean,reflect:!0})],O.prototype,"withoutSpinButtons",2);f([m({type:Boolean,reflect:!0})],O.prototype,"required",2);f([m()],O.prototype,"pattern",2);f([m({type:Number})],O.prototype,"minlength",2);f([m({type:Number})],O.prototype,"maxlength",2);f([m()],O.prototype,"min",2);f([m()],O.prototype,"max",2);f([m()],O.prototype,"step",2);f([m()],O.prototype,"autocapitalize",2);f([m({type:Boolean,converter:{fromAttribute:r=>!(!r||r==="off"),toAttribute:r=>r?"on":"off"}})],O.prototype,"autocorrect",2);f([m()],O.prototype,"autocomplete",2);f([m({type:Boolean})],O.prototype,"autofocus",2);f([m()],O.prototype,"enterkeyhint",2);f([m({type:Boolean,converter:{fromAttribute:r=>!(!r||r==="false"),toAttribute:r=>r?"true":"false"}})],O.prototype,"spellcheck",2);f([m()],O.prototype,"inputmode",2);f([m({attribute:"with-label",type:Boolean})],O.prototype,"withLabel",2);f([m({attribute:"with-hint",type:Boolean})],O.prototype,"withHint",2);f([nt("step",{waitUntilFirstUpdate:!0})],O.prototype,"handleStepChange",1);O=f([B("wa-input")],O);O.disableWarning?.("change-in-update");var Ms=z`
  :host {
    display: contents;
  }
`;function bo(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Kt=bo();function Ns(r){Kt=r}var Vs=/[&<>"']/,Qa=new RegExp(Vs.source,"g"),Us=/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,Ja=new RegExp(Us.source,"g"),tl={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Is=r=>tl[r];function ut(r,t){if(t){if(Vs.test(r))return r.replace(Qa,Is)}else if(Us.test(r))return r.replace(Ja,Is);return r}var el=/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig;function rl(r){return r.replace(el,(t,e)=>(e=e.toLowerCase(),e==="colon"?":":e.charAt(0)==="#"?e.charAt(1)==="x"?String.fromCharCode(parseInt(e.substring(2),16)):String.fromCharCode(+e.substring(1)):""))}var ol=/(^|[^\[])\^/g;function U(r,t){let e=typeof r=="string"?r:r.source;t=t||"";let o={replace:(i,s)=>{let n=typeof s=="string"?s:s.source;return n=n.replace(ol,"$1"),e=e.replace(i,n),o},getRegex:()=>new RegExp(e,t)};return o}function Ds(r){try{r=encodeURI(r).replace(/%25/g,"%")}catch{return null}return r}var qe={exec:()=>null};function Fs(r,t){let e=r.replace(/\|/g,(s,n,c)=>{let h=!1,g=n;for(;--g>=0&&c[g]==="\\";)h=!h;return h?"|":" |"}),o=e.split(/ \|/),i=0;if(o[0].trim()||o.shift(),o.length>0&&!o[o.length-1].trim()&&o.pop(),t)if(o.length>t)o.splice(t);else for(;o.length<t;)o.push("");for(;i<o.length;i++)o[i]=o[i].trim().replace(/\\\|/g,"|");return o}function Cr(r,t,e){let o=r.length;if(o===0)return"";let i=0;for(;i<o;){let s=r.charAt(o-i-1);if(s===t&&!e)i++;else if(s!==t&&e)i++;else break}return r.slice(0,o-i)}function il(r,t){if(r.indexOf(t[1])===-1)return-1;let e=0;for(let o=0;o<r.length;o++)if(r[o]==="\\")o++;else if(r[o]===t[0])e++;else if(r[o]===t[1]&&(e--,e<0))return o;return-1}function qs(r,t,e,o){let i=t.href,s=t.title?ut(t.title):null,n=r[1].replace(/\\([\[\]])/g,"$1");if(r[0].charAt(0)!=="!"){o.state.inLink=!0;let c={type:"link",raw:e,href:i,title:s,text:n,tokens:o.inlineTokens(n)};return o.state.inLink=!1,c}return{type:"image",raw:e,href:i,title:s,text:ut(n)}}function sl(r,t){let e=r.match(/^(\s+)(?:```)/);if(e===null)return t;let o=e[1];return t.split(`
`).map(i=>{let s=i.match(/^\s+/);if(s===null)return i;let[n]=s;return n.length>=o.length?i.slice(o.length):i}).join(`
`)}var pe=class{options;rules;lexer;constructor(t){this.options=t||Kt}space(t){let e=this.rules.block.newline.exec(t);if(e&&e[0].length>0)return{type:"space",raw:e[0]}}code(t){let e=this.rules.block.code.exec(t);if(e){let o=e[0].replace(/^ {1,4}/gm,"");return{type:"code",raw:e[0],codeBlockStyle:"indented",text:this.options.pedantic?o:Cr(o,`
`)}}}fences(t){let e=this.rules.block.fences.exec(t);if(e){let o=e[0],i=sl(o,e[3]||"");return{type:"code",raw:o,lang:e[2]?e[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):e[2],text:i}}}heading(t){let e=this.rules.block.heading.exec(t);if(e){let o=e[2].trim();if(/#$/.test(o)){let i=Cr(o,"#");(this.options.pedantic||!i||/ $/.test(i))&&(o=i.trim())}return{type:"heading",raw:e[0],depth:e[1].length,text:o,tokens:this.lexer.inline(o)}}}hr(t){let e=this.rules.block.hr.exec(t);if(e)return{type:"hr",raw:e[0]}}blockquote(t){let e=this.rules.block.blockquote.exec(t);if(e){let o=Cr(e[0].replace(/^ *>[ \t]?/gm,""),`
`),i=this.lexer.state.top;this.lexer.state.top=!0;let s=this.lexer.blockTokens(o);return this.lexer.state.top=i,{type:"blockquote",raw:e[0],tokens:s,text:o}}}list(t){let e=this.rules.block.list.exec(t);if(e){let o=e[1].trim(),i=o.length>1,s={type:"list",raw:"",ordered:i,start:i?+o.slice(0,-1):"",loose:!1,items:[]};o=i?`\\d{1,9}\\${o.slice(-1)}`:`\\${o}`,this.options.pedantic&&(o=i?o:"[*+-]");let n=new RegExp(`^( {0,3}${o})((?:[	 ][^\\n]*)?(?:\\n|$))`),c="",h="",g=!1;for(;t;){let l=!1;if(!(e=n.exec(t))||this.rules.block.hr.test(t))break;c=e[0],t=t.substring(c.length);let a=e[2].split(`
`,1)[0].replace(/^\t+/,k=>" ".repeat(3*k.length)),p=t.split(`
`,1)[0],d=0;this.options.pedantic?(d=2,h=a.trimStart()):(d=e[2].search(/[^ ]/),d=d>4?1:d,h=a.slice(d),d+=e[1].length);let u=!1;if(!a&&/^ *$/.test(p)&&(c+=p+`
`,t=t.substring(p.length+1),l=!0),!l){let k=new RegExp(`^ {0,${Math.min(3,d-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),E=new RegExp(`^ {0,${Math.min(3,d-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),y=new RegExp(`^ {0,${Math.min(3,d-1)}}(?:\`\`\`|~~~)`),w=new RegExp(`^ {0,${Math.min(3,d-1)}}#`);for(;t;){let x=t.split(`
`,1)[0];if(p=x,this.options.pedantic&&(p=p.replace(/^ {1,4}(?=( {4})*[^ ])/g,"  ")),y.test(p)||w.test(p)||k.test(p)||E.test(t))break;if(p.search(/[^ ]/)>=d||!p.trim())h+=`
`+p.slice(d);else{if(u||a.search(/[^ ]/)>=4||y.test(a)||w.test(a)||E.test(a))break;h+=`
`+p}!u&&!p.trim()&&(u=!0),c+=x+`
`,t=t.substring(x.length+1),a=p.slice(d)}}s.loose||(g?s.loose=!0:/\n *\n *$/.test(c)&&(g=!0));let C=null,_;this.options.gfm&&(C=/^\[[ xX]\] /.exec(h),C&&(_=C[0]!=="[ ] ",h=h.replace(/^\[[ xX]\] +/,""))),s.items.push({type:"list_item",raw:c,task:!!C,checked:_,loose:!1,text:h,tokens:[]}),s.raw+=c}s.items[s.items.length-1].raw=c.trimEnd(),s.items[s.items.length-1].text=h.trimEnd(),s.raw=s.raw.trimEnd();for(let l=0;l<s.items.length;l++)if(this.lexer.state.top=!1,s.items[l].tokens=this.lexer.blockTokens(s.items[l].text,[]),!s.loose){let a=s.items[l].tokens.filter(d=>d.type==="space"),p=a.length>0&&a.some(d=>/\n.*\n/.test(d.raw));s.loose=p}if(s.loose)for(let l=0;l<s.items.length;l++)s.items[l].loose=!0;return s}}html(t){let e=this.rules.block.html.exec(t);if(e)return{type:"html",block:!0,raw:e[0],pre:e[1]==="pre"||e[1]==="script"||e[1]==="style",text:e[0]}}def(t){let e=this.rules.block.def.exec(t);if(e){let o=e[1].toLowerCase().replace(/\s+/g," "),i=e[2]?e[2].replace(/^<(.*)>$/,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",s=e[3]?e[3].substring(1,e[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):e[3];return{type:"def",tag:o,raw:e[0],href:i,title:s}}}table(t){let e=this.rules.block.table.exec(t);if(!e||!/[:|]/.test(e[2]))return;let o=Fs(e[1]),i=e[2].replace(/^\||\| *$/g,"").split("|"),s=e[3]&&e[3].trim()?e[3].replace(/\n[ \t]*$/,"").split(`
`):[],n={type:"table",raw:e[0],header:[],align:[],rows:[]};if(o.length===i.length){for(let c of i)/^ *-+: *$/.test(c)?n.align.push("right"):/^ *:-+: *$/.test(c)?n.align.push("center"):/^ *:-+ *$/.test(c)?n.align.push("left"):n.align.push(null);for(let c of o)n.header.push({text:c,tokens:this.lexer.inline(c)});for(let c of s)n.rows.push(Fs(c,n.header.length).map(h=>({text:h,tokens:this.lexer.inline(h)})));return n}}lheading(t){let e=this.rules.block.lheading.exec(t);if(e)return{type:"heading",raw:e[0],depth:e[2].charAt(0)==="="?1:2,text:e[1],tokens:this.lexer.inline(e[1])}}paragraph(t){let e=this.rules.block.paragraph.exec(t);if(e){let o=e[1].charAt(e[1].length-1)===`
`?e[1].slice(0,-1):e[1];return{type:"paragraph",raw:e[0],text:o,tokens:this.lexer.inline(o)}}}text(t){let e=this.rules.block.text.exec(t);if(e)return{type:"text",raw:e[0],text:e[0],tokens:this.lexer.inline(e[0])}}escape(t){let e=this.rules.inline.escape.exec(t);if(e)return{type:"escape",raw:e[0],text:ut(e[1])}}tag(t){let e=this.rules.inline.tag.exec(t);if(e)return!this.lexer.state.inLink&&/^<a /i.test(e[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&/^<\/a>/i.test(e[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&/^<(pre|code|kbd|script)(\s|>)/i.test(e[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&/^<\/(pre|code|kbd|script)(\s|>)/i.test(e[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:e[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:e[0]}}link(t){let e=this.rules.inline.link.exec(t);if(e){let o=e[2].trim();if(!this.options.pedantic&&/^</.test(o)){if(!/>$/.test(o))return;let n=Cr(o.slice(0,-1),"\\");if((o.length-n.length)%2===0)return}else{let n=il(e[2],"()");if(n>-1){let h=(e[0].indexOf("!")===0?5:4)+e[1].length+n;e[2]=e[2].substring(0,n),e[0]=e[0].substring(0,h).trim(),e[3]=""}}let i=e[2],s="";if(this.options.pedantic){let n=/^([^'"]*[^\s])\s+(['"])(.*)\2/.exec(i);n&&(i=n[1],s=n[3])}else s=e[3]?e[3].slice(1,-1):"";return i=i.trim(),/^</.test(i)&&(this.options.pedantic&&!/>$/.test(o)?i=i.slice(1):i=i.slice(1,-1)),qs(e,{href:i&&i.replace(this.rules.inline.anyPunctuation,"$1"),title:s&&s.replace(this.rules.inline.anyPunctuation,"$1")},e[0],this.lexer)}}reflink(t,e){let o;if((o=this.rules.inline.reflink.exec(t))||(o=this.rules.inline.nolink.exec(t))){let i=(o[2]||o[1]).replace(/\s+/g," "),s=e[i.toLowerCase()];if(!s){let n=o[0].charAt(0);return{type:"text",raw:n,text:n}}return qs(o,s,o[0],this.lexer)}}emStrong(t,e,o=""){let i=this.rules.inline.emStrongLDelim.exec(t);if(!i||i[3]&&o.match(/[\p{L}\p{N}]/u))return;if(!(i[1]||i[2]||"")||!o||this.rules.inline.punctuation.exec(o)){let n=[...i[0]].length-1,c,h,g=n,l=0,a=i[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(a.lastIndex=0,e=e.slice(-1*t.length+n);(i=a.exec(e))!=null;){if(c=i[1]||i[2]||i[3]||i[4]||i[5]||i[6],!c)continue;if(h=[...c].length,i[3]||i[4]){g+=h;continue}else if((i[5]||i[6])&&n%3&&!((n+h)%3)){l+=h;continue}if(g-=h,g>0)continue;h=Math.min(h,h+g+l);let p=[...i[0]][0].length,d=t.slice(0,n+i.index+p+h);if(Math.min(n,h)%2){let C=d.slice(1,-1);return{type:"em",raw:d,text:C,tokens:this.lexer.inlineTokens(C)}}let u=d.slice(2,-2);return{type:"strong",raw:d,text:u,tokens:this.lexer.inlineTokens(u)}}}}codespan(t){let e=this.rules.inline.code.exec(t);if(e){let o=e[2].replace(/\n/g," "),i=/[^ ]/.test(o),s=/^ /.test(o)&&/ $/.test(o);return i&&s&&(o=o.substring(1,o.length-1)),o=ut(o,!0),{type:"codespan",raw:e[0],text:o}}}br(t){let e=this.rules.inline.br.exec(t);if(e)return{type:"br",raw:e[0]}}del(t){let e=this.rules.inline.del.exec(t);if(e)return{type:"del",raw:e[0],text:e[2],tokens:this.lexer.inlineTokens(e[2])}}autolink(t){let e=this.rules.inline.autolink.exec(t);if(e){let o,i;return e[2]==="@"?(o=ut(e[1]),i="mailto:"+o):(o=ut(e[1]),i=o),{type:"link",raw:e[0],text:o,href:i,tokens:[{type:"text",raw:o,text:o}]}}}url(t){let e;if(e=this.rules.inline.url.exec(t)){let o,i;if(e[2]==="@")o=ut(e[0]),i="mailto:"+o;else{let s;do s=e[0],e[0]=this.rules.inline._backpedal.exec(e[0])?.[0]??"";while(s!==e[0]);o=ut(e[0]),e[1]==="www."?i="http://"+e[0]:i=e[0]}return{type:"link",raw:e[0],text:o,href:i,tokens:[{type:"text",raw:o,text:o}]}}}inlineText(t){let e=this.rules.inline.text.exec(t);if(e){let o;return this.lexer.state.inRawBlock?o=e[0]:o=ut(e[0]),{type:"text",raw:e[0],text:o}}}},nl=/^(?: *(?:\n|$))+/,al=/^( {4}[^\n]+(?:\n(?: *(?:\n|$))*)?)+/,ll=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Ve=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,cl=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Hs=/(?:[*+-]|\d{1,9}[.)])/,Ws=U(/^(?!bull )((?:.|\n(?!\s*?\n|bull ))+?)\n {0,3}(=+|-+) *(?:\n+|$)/).replace(/bull/g,Hs).getRegex(),wo=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,ul=/^[^\n]+/,vo=/(?!\s*\])(?:\\.|[^\[\]\\])+/,hl=U(/^ {0,3}\[(label)\]: *(?:\n *)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n *)?| *\n *)(title))? *(?:\n+|$)/).replace("label",vo).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),dl=U(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Hs).getRegex(),Sr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",yo=/<!--(?!-?>)[\s\S]*?(?:-->|$)/,pl=U("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n *)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$))","i").replace("comment",yo).replace("tag",Sr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),js=U(wo).replace("hr",Ve).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Sr).getRegex(),fl=U(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",js).getRegex(),xo={blockquote:fl,code:al,def:hl,fences:ll,heading:cl,hr:Ve,html:pl,lheading:Ws,list:dl,newline:nl,paragraph:js,table:qe,text:ul},Bs=U("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Ve).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code"," {4}[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Sr).getRegex(),ml={...xo,table:Bs,paragraph:U(wo).replace("hr",Ve).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Bs).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Sr).getRegex()},gl={...xo,html:U(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",yo).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:qe,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:U(wo).replace("hr",Ve).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Ws).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},Ys=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,bl=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,Ks=/^( {2,}|\\)\n(?!\s*$)/,wl=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,Ue="\\p{P}$+<=>`^|~",vl=U(/^((?![*_])[\spunctuation])/,"u").replace(/punctuation/g,Ue).getRegex(),yl=/\[[^[\]]*?\]\([^\(\)]*?\)|`[^`]*?`|<[^<>]*?>/g,xl=U(/^(?:\*+(?:((?!\*)[punct])|[^\s*]))|^_+(?:((?!_)[punct])|([^\s_]))/,"u").replace(/punct/g,Ue).getRegex(),Cl=U("^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)[punct](\\*+)(?=[\\s]|$)|[^punct\\s](\\*+)(?!\\*)(?=[punct\\s]|$)|(?!\\*)[punct\\s](\\*+)(?=[^punct\\s])|[\\s](\\*+)(?!\\*)(?=[punct])|(?!\\*)[punct](\\*+)(?!\\*)(?=[punct])|[^punct\\s](\\*+)(?=[^punct\\s])","gu").replace(/punct/g,Ue).getRegex(),_l=U("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)[punct](_+)(?=[\\s]|$)|[^punct\\s](_+)(?!_)(?=[punct\\s]|$)|(?!_)[punct\\s](_+)(?=[^punct\\s])|[\\s](_+)(?!_)(?=[punct])|(?!_)[punct](_+)(?!_)(?=[punct])","gu").replace(/punct/g,Ue).getRegex(),kl=U(/\\([punct])/,"gu").replace(/punct/g,Ue).getRegex(),Sl=U(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),El=U(yo).replace("(?:-->|$)","-->").getRegex(),$l=U("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",El).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),kr=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,Al=U(/^!?\[(label)\]\(\s*(href)(?:\s+(title))?\s*\)/).replace("label",kr).replace("href",/<(?:\\.|[^\n<>\\])+>|[^\s\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Gs=U(/^!?\[(label)\]\[(ref)\]/).replace("label",kr).replace("ref",vo).getRegex(),Zs=U(/^!?\[(ref)\](?:\[\])?/).replace("ref",vo).getRegex(),Ll=U("reflink|nolink(?!\\()","g").replace("reflink",Gs).replace("nolink",Zs).getRegex(),Co={_backpedal:qe,anyPunctuation:kl,autolink:Sl,blockSkip:yl,br:Ks,code:bl,del:qe,emStrongLDelim:xl,emStrongRDelimAst:Cl,emStrongRDelimUnd:_l,escape:Ys,link:Al,nolink:Zs,punctuation:vl,reflink:Gs,reflinkSearch:Ll,tag:$l,text:wl,url:qe},Rl={...Co,link:U(/^!?\[(label)\]\((.*?)\)/).replace("label",kr).getRegex(),reflink:U(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",kr).getRegex()},go={...Co,escape:U(Ys).replace("])","~|])").getRegex(),url:U(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])([\s\S]*?[^\s~])\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},Tl={...go,br:U(Ks).replace("{2,}","*").getRegex(),text:U(go.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},_r={normal:xo,gfm:ml,pedantic:gl},Fe={normal:Co,gfm:go,breaks:Tl,pedantic:Rl},$t=class r{tokens;options;state;tokenizer;inlineQueue;constructor(t){this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Kt,this.options.tokenizer=this.options.tokenizer||new pe,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};let e={block:_r.normal,inline:Fe.normal};this.options.pedantic?(e.block=_r.pedantic,e.inline=Fe.pedantic):this.options.gfm&&(e.block=_r.gfm,this.options.breaks?e.inline=Fe.breaks:e.inline=Fe.gfm),this.tokenizer.rules=e}static get rules(){return{block:_r,inline:Fe}}static lex(t,e){return new r(e).lex(t)}static lexInline(t,e){return new r(e).inlineTokens(t)}lex(t){t=t.replace(/\r\n|\r/g,`
`),this.blockTokens(t,this.tokens);for(let e=0;e<this.inlineQueue.length;e++){let o=this.inlineQueue[e];this.inlineTokens(o.src,o.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,e=[]){this.options.pedantic?t=t.replace(/\t/g,"    ").replace(/^ +$/gm,""):t=t.replace(/^( *)(\t+)/gm,(c,h,g)=>h+"    ".repeat(g.length));let o,i,s,n;for(;t;)if(!(this.options.extensions&&this.options.extensions.block&&this.options.extensions.block.some(c=>(o=c.call({lexer:this},t,e))?(t=t.substring(o.raw.length),e.push(o),!0):!1))){if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length),o.raw.length===1&&e.length>0?e[e.length-1].raw+=`
`:e.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length),i=e[e.length-1],i&&(i.type==="paragraph"||i.type==="text")?(i.raw+=`
`+o.raw,i.text+=`
`+o.text,this.inlineQueue[this.inlineQueue.length-1].src=i.text):e.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),e.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),e.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),e.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),e.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),e.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),e.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length),i=e[e.length-1],i&&(i.type==="paragraph"||i.type==="text")?(i.raw+=`
`+o.raw,i.text+=`
`+o.raw,this.inlineQueue[this.inlineQueue.length-1].src=i.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),e.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),e.push(o);continue}if(s=t,this.options.extensions&&this.options.extensions.startBlock){let c=1/0,h=t.slice(1),g;this.options.extensions.startBlock.forEach(l=>{g=l.call({lexer:this},h),typeof g=="number"&&g>=0&&(c=Math.min(c,g))}),c<1/0&&c>=0&&(s=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(s))){i=e[e.length-1],n&&i.type==="paragraph"?(i.raw+=`
`+o.raw,i.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue[this.inlineQueue.length-1].src=i.text):e.push(o),n=s.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length),i=e[e.length-1],i&&i.type==="text"?(i.raw+=`
`+o.raw,i.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue[this.inlineQueue.length-1].src=i.text):e.push(o);continue}if(t){let c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,e}inline(t,e=[]){return this.inlineQueue.push({src:t,tokens:e}),e}inlineTokens(t,e=[]){let o,i,s,n=t,c,h,g;if(this.tokens.links){let l=Object.keys(this.tokens.links);if(l.length>0)for(;(c=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)l.includes(c[0].slice(c[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,c.index)+"["+"a".repeat(c[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(c=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,c.index)+"["+"a".repeat(c[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);for(;(c=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,c.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;t;)if(h||(g=""),h=!1,!(this.options.extensions&&this.options.extensions.inline&&this.options.extensions.inline.some(l=>(o=l.call({lexer:this},t,e))?(t=t.substring(o.raw.length),e.push(o),!0):!1))){if(o=this.tokenizer.escape(t)){t=t.substring(o.raw.length),e.push(o);continue}if(o=this.tokenizer.tag(t)){t=t.substring(o.raw.length),i=e[e.length-1],i&&o.type==="text"&&i.type==="text"?(i.raw+=o.raw,i.text+=o.text):e.push(o);continue}if(o=this.tokenizer.link(t)){t=t.substring(o.raw.length),e.push(o);continue}if(o=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(o.raw.length),i=e[e.length-1],i&&o.type==="text"&&i.type==="text"?(i.raw+=o.raw,i.text+=o.text):e.push(o);continue}if(o=this.tokenizer.emStrong(t,n,g)){t=t.substring(o.raw.length),e.push(o);continue}if(o=this.tokenizer.codespan(t)){t=t.substring(o.raw.length),e.push(o);continue}if(o=this.tokenizer.br(t)){t=t.substring(o.raw.length),e.push(o);continue}if(o=this.tokenizer.del(t)){t=t.substring(o.raw.length),e.push(o);continue}if(o=this.tokenizer.autolink(t)){t=t.substring(o.raw.length),e.push(o);continue}if(!this.state.inLink&&(o=this.tokenizer.url(t))){t=t.substring(o.raw.length),e.push(o);continue}if(s=t,this.options.extensions&&this.options.extensions.startInline){let l=1/0,a=t.slice(1),p;this.options.extensions.startInline.forEach(d=>{p=d.call({lexer:this},a),typeof p=="number"&&p>=0&&(l=Math.min(l,p))}),l<1/0&&l>=0&&(s=t.substring(0,l+1))}if(o=this.tokenizer.inlineText(s)){t=t.substring(o.raw.length),o.raw.slice(-1)!=="_"&&(g=o.raw.slice(-1)),h=!0,i=e[e.length-1],i&&i.type==="text"?(i.raw+=o.raw,i.text+=o.text):e.push(o);continue}if(t){let l="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(l);break}else throw new Error(l)}}return e}},fe=class{options;constructor(t){this.options=t||Kt}code(t,e,o){let i=(e||"").match(/^\S*/)?.[0];return t=t.replace(/\n$/,"")+`
`,i?'<pre><code class="language-'+ut(i)+'">'+(o?t:ut(t,!0))+`</code></pre>
`:"<pre><code>"+(o?t:ut(t,!0))+`</code></pre>
`}blockquote(t){return`<blockquote>
${t}</blockquote>
`}html(t,e){return t}heading(t,e,o){return`<h${e}>${t}</h${e}>
`}hr(){return`<hr>
`}list(t,e,o){let i=e?"ol":"ul",s=e&&o!==1?' start="'+o+'"':"";return"<"+i+s+`>
`+t+"</"+i+`>
`}listitem(t,e,o){return`<li>${t}</li>
`}checkbox(t){return"<input "+(t?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph(t){return`<p>${t}</p>
`}table(t,e){return e&&(e=`<tbody>${e}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+e+`</table>
`}tablerow(t){return`<tr>
${t}</tr>
`}tablecell(t,e){let o=e.header?"th":"td";return(e.align?`<${o} align="${e.align}">`:`<${o}>`)+t+`</${o}>
`}strong(t){return`<strong>${t}</strong>`}em(t){return`<em>${t}</em>`}codespan(t){return`<code>${t}</code>`}br(){return"<br>"}del(t){return`<del>${t}</del>`}link(t,e,o){let i=Ds(t);if(i===null)return o;t=i;let s='<a href="'+t+'"';return e&&(s+=' title="'+e+'"'),s+=">"+o+"</a>",s}image(t,e,o){let i=Ds(t);if(i===null)return o;t=i;let s=`<img src="${t}" alt="${o}"`;return e&&(s+=` title="${e}"`),s+=">",s}text(t){return t}},Be=class{strong(t){return t}em(t){return t}codespan(t){return t}del(t){return t}html(t){return t}text(t){return t}link(t,e,o){return""+o}image(t,e,o){return""+o}br(){return""}},At=class r{options;renderer;textRenderer;constructor(t){this.options=t||Kt,this.options.renderer=this.options.renderer||new fe,this.renderer=this.options.renderer,this.renderer.options=this.options,this.textRenderer=new Be}static parse(t,e){return new r(e).parse(t)}static parseInline(t,e){return new r(e).parseInline(t)}parse(t,e=!0){let o="";for(let i=0;i<t.length;i++){let s=t[i];if(this.options.extensions&&this.options.extensions.renderers&&this.options.extensions.renderers[s.type]){let n=s,c=this.options.extensions.renderers[n.type].call({parser:this},n);if(c!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(n.type)){o+=c||"";continue}}switch(s.type){case"space":continue;case"hr":{o+=this.renderer.hr();continue}case"heading":{let n=s;o+=this.renderer.heading(this.parseInline(n.tokens),n.depth,rl(this.parseInline(n.tokens,this.textRenderer)));continue}case"code":{let n=s;o+=this.renderer.code(n.text,n.lang,!!n.escaped);continue}case"table":{let n=s,c="",h="";for(let l=0;l<n.header.length;l++)h+=this.renderer.tablecell(this.parseInline(n.header[l].tokens),{header:!0,align:n.align[l]});c+=this.renderer.tablerow(h);let g="";for(let l=0;l<n.rows.length;l++){let a=n.rows[l];h="";for(let p=0;p<a.length;p++)h+=this.renderer.tablecell(this.parseInline(a[p].tokens),{header:!1,align:n.align[p]});g+=this.renderer.tablerow(h)}o+=this.renderer.table(c,g);continue}case"blockquote":{let n=s,c=this.parse(n.tokens);o+=this.renderer.blockquote(c);continue}case"list":{let n=s,c=n.ordered,h=n.start,g=n.loose,l="";for(let a=0;a<n.items.length;a++){let p=n.items[a],d=p.checked,u=p.task,C="";if(p.task){let _=this.renderer.checkbox(!!d);g?p.tokens.length>0&&p.tokens[0].type==="paragraph"?(p.tokens[0].text=_+" "+p.tokens[0].text,p.tokens[0].tokens&&p.tokens[0].tokens.length>0&&p.tokens[0].tokens[0].type==="text"&&(p.tokens[0].tokens[0].text=_+" "+p.tokens[0].tokens[0].text)):p.tokens.unshift({type:"text",text:_+" "}):C+=_+" "}C+=this.parse(p.tokens,g),l+=this.renderer.listitem(C,u,!!d)}o+=this.renderer.list(l,c,h);continue}case"html":{let n=s;o+=this.renderer.html(n.text,n.block);continue}case"paragraph":{let n=s;o+=this.renderer.paragraph(this.parseInline(n.tokens));continue}case"text":{let n=s,c=n.tokens?this.parseInline(n.tokens):n.text;for(;i+1<t.length&&t[i+1].type==="text";)n=t[++i],c+=`
`+(n.tokens?this.parseInline(n.tokens):n.text);o+=e?this.renderer.paragraph(c):c;continue}default:{let n='Token with "'+s.type+'" type was not found.';if(this.options.silent)return console.error(n),"";throw new Error(n)}}}return o}parseInline(t,e){e=e||this.renderer;let o="";for(let i=0;i<t.length;i++){let s=t[i];if(this.options.extensions&&this.options.extensions.renderers&&this.options.extensions.renderers[s.type]){let n=this.options.extensions.renderers[s.type].call({parser:this},s);if(n!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(s.type)){o+=n||"";continue}}switch(s.type){case"escape":{let n=s;o+=e.text(n.text);break}case"html":{let n=s;o+=e.html(n.text);break}case"link":{let n=s;o+=e.link(n.href,n.title,this.parseInline(n.tokens,e));break}case"image":{let n=s;o+=e.image(n.href,n.title,n.text);break}case"strong":{let n=s;o+=e.strong(this.parseInline(n.tokens,e));break}case"em":{let n=s;o+=e.em(this.parseInline(n.tokens,e));break}case"codespan":{let n=s;o+=e.codespan(n.text);break}case"br":{o+=e.br();break}case"del":{let n=s;o+=e.del(this.parseInline(n.tokens,e));break}case"text":{let n=s;o+=e.text(n.text);break}default:{let n='Token with "'+s.type+'" type was not found.';if(this.options.silent)return console.error(n),"";throw new Error(n)}}}return o}},de=class{options;constructor(t){this.options=t||Kt}static passThroughHooks=new Set(["preprocess","postprocess","processAllTokens"]);preprocess(t){return t}postprocess(t){return t}processAllTokens(t){return t}},Ne=class{defaults=bo();options=this.setOptions;parse=this.#t($t.lex,At.parse);parseInline=this.#t($t.lexInline,At.parseInline);Parser=At;Renderer=fe;TextRenderer=Be;Lexer=$t;Tokenizer=pe;Hooks=de;constructor(...t){this.use(...t)}walkTokens(t,e){let o=[];for(let i of t)switch(o=o.concat(e.call(this,i)),i.type){case"table":{let s=i;for(let n of s.header)o=o.concat(this.walkTokens(n.tokens,e));for(let n of s.rows)for(let c of n)o=o.concat(this.walkTokens(c.tokens,e));break}case"list":{let s=i;o=o.concat(this.walkTokens(s.items,e));break}default:{let s=i;this.defaults.extensions?.childTokens?.[s.type]?this.defaults.extensions.childTokens[s.type].forEach(n=>{let c=s[n].flat(1/0);o=o.concat(this.walkTokens(c,e))}):s.tokens&&(o=o.concat(this.walkTokens(s.tokens,e)))}}return o}use(...t){let e=this.defaults.extensions||{renderers:{},childTokens:{}};return t.forEach(o=>{let i={...o};if(i.async=this.defaults.async||i.async||!1,o.extensions&&(o.extensions.forEach(s=>{if(!s.name)throw new Error("extension name required");if("renderer"in s){let n=e.renderers[s.name];n?e.renderers[s.name]=function(...c){let h=s.renderer.apply(this,c);return h===!1&&(h=n.apply(this,c)),h}:e.renderers[s.name]=s.renderer}if("tokenizer"in s){if(!s.level||s.level!=="block"&&s.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");let n=e[s.level];n?n.unshift(s.tokenizer):e[s.level]=[s.tokenizer],s.start&&(s.level==="block"?e.startBlock?e.startBlock.push(s.start):e.startBlock=[s.start]:s.level==="inline"&&(e.startInline?e.startInline.push(s.start):e.startInline=[s.start]))}"childTokens"in s&&s.childTokens&&(e.childTokens[s.name]=s.childTokens)}),i.extensions=e),o.renderer){let s=this.defaults.renderer||new fe(this.defaults);for(let n in o.renderer){if(!(n in s))throw new Error(`renderer '${n}' does not exist`);if(n==="options")continue;let c=n,h=o.renderer[c],g=s[c];s[c]=(...l)=>{let a=h.apply(s,l);return a===!1&&(a=g.apply(s,l)),a||""}}i.renderer=s}if(o.tokenizer){let s=this.defaults.tokenizer||new pe(this.defaults);for(let n in o.tokenizer){if(!(n in s))throw new Error(`tokenizer '${n}' does not exist`);if(["options","rules","lexer"].includes(n))continue;let c=n,h=o.tokenizer[c],g=s[c];s[c]=(...l)=>{let a=h.apply(s,l);return a===!1&&(a=g.apply(s,l)),a}}i.tokenizer=s}if(o.hooks){let s=this.defaults.hooks||new de;for(let n in o.hooks){if(!(n in s))throw new Error(`hook '${n}' does not exist`);if(n==="options")continue;let c=n,h=o.hooks[c],g=s[c];de.passThroughHooks.has(n)?s[c]=l=>{if(this.defaults.async)return Promise.resolve(h.call(s,l)).then(p=>g.call(s,p));let a=h.call(s,l);return g.call(s,a)}:s[c]=(...l)=>{let a=h.apply(s,l);return a===!1&&(a=g.apply(s,l)),a}}i.hooks=s}if(o.walkTokens){let s=this.defaults.walkTokens,n=o.walkTokens;i.walkTokens=function(c){let h=[];return h.push(n.call(this,c)),s&&(h=h.concat(s.call(this,c))),h}}this.defaults={...this.defaults,...i}}),this}setOptions(t){return this.defaults={...this.defaults,...t},this}lexer(t,e){return $t.lex(t,e??this.defaults)}parser(t,e){return At.parse(t,e??this.defaults)}#t(t,e){return(o,i)=>{let s={...i},n={...this.defaults,...s};this.defaults.async===!0&&s.async===!1&&(n.silent||console.warn("marked(): The async option was set to true by an extension. The async: false option sent to parse will be ignored."),n.async=!0);let c=this.#r(!!n.silent,!!n.async);if(typeof o>"u"||o===null)return c(new Error("marked(): input parameter is undefined or null"));if(typeof o!="string")return c(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(o)+", string expected"));if(n.hooks&&(n.hooks.options=n),n.async)return Promise.resolve(n.hooks?n.hooks.preprocess(o):o).then(h=>t(h,n)).then(h=>n.hooks?n.hooks.processAllTokens(h):h).then(h=>n.walkTokens?Promise.all(this.walkTokens(h,n.walkTokens)).then(()=>h):h).then(h=>e(h,n)).then(h=>n.hooks?n.hooks.postprocess(h):h).catch(c);try{n.hooks&&(o=n.hooks.preprocess(o));let h=t(o,n);n.hooks&&(h=n.hooks.processAllTokens(h)),n.walkTokens&&this.walkTokens(h,n.walkTokens);let g=e(h,n);return n.hooks&&(g=n.hooks.postprocess(g)),g}catch(h){return c(h)}}}#r(t,e){return o=>{if(o.message+=`
Please report this to https://github.com/markedjs/marked.`,t){let i="<p>An error occurred:</p><pre>"+ut(o.message+"",!0)+"</pre>";return e?Promise.resolve(i):i}if(e)return Promise.reject(o);throw o}}},Yt=new Ne;function V(r,t){return Yt.parse(r,t)}V.options=V.setOptions=function(r){return Yt.setOptions(r),V.defaults=Yt.defaults,Ns(V.defaults),V};V.getDefaults=bo;V.defaults=Kt;V.use=function(...r){return Yt.use(...r),V.defaults=Yt.defaults,Ns(V.defaults),V};V.walkTokens=function(r,t){return Yt.walkTokens(r,t)};V.parseInline=Yt.parseInline;V.Parser=At;V.parser=At.parse;V.Renderer=fe;V.TextRenderer=Be;V.Lexer=$t;V.lexer=$t.lex;V.Tokenizer=pe;V.Hooks=de;V.parse=V;var Wm=V.options,jm=V.setOptions,Ym=V.use,Km=V.walkTokens,Gm=V.parseInline;var Zm=At.parse,Xm=$t.lex;var _o=new Ne,ko=new Set,He=class extends Z{constructor(){super(...arguments),this.renderGeneration=0,this.suppressSlotChange=!1,this.tabSize=4}static getMarked(){return _o}static updateAll(){for(let r of ko)r.renderMarkdown()}get marked(){return _o}connectedCallback(){super.connectedCallback(),ko.add(this)}disconnectedCallback(){ko.delete(this),super.disconnectedCallback()}dedent(r){let e=r.replace(/\r\n/g,`
`).split(`
`).map(h=>{let g="",l=0;for(let a=0;a<h.length;a++){let p=h[a];if(p==="	"){let d=this.tabSize-l%this.tabSize;g+=" ".repeat(d),l+=d}else if(p===" ")g+=" ",l++;else{g+=h.slice(a);break}}return g}),o=0;for(;o<e.length&&e[o].trim()==="";)o++;let i=e.length-1;for(;i>=o&&e[i].trim()==="";)i--;let s=e.slice(o,i+1);if(s.length===0)return"";let n=1/0;for(let h of s){if(h.trim()==="")continue;let g=h.match(/^( *)/),l=g?g[1].length:0;n=Math.min(n,l)}return n===1/0&&(n=0),s.map(h=>h.trim()===""?"":h.slice(n)).join(`
`)}getSourceScript(){return this.querySelector('script[type="text/markdown"]')}renderMarkdown(){let r=this.getSourceScript();if(!r){console.warn('No <script type="text/markdown"> found. Provide markdown content inside a <script type="text/markdown"> element.',this);return}let t=++this.renderGeneration,e=r.textContent??"",o=this.dedent(e),i;try{i=_o.parse(o)}catch(n){console.error("Failed to parse markdown content.",n,this);return}let s=n=>{if(t!==this.renderGeneration)return;this.suppressSlotChange=!0;for(let h of[...this.childNodes])h!==r&&h.remove();let c=document.createRange().createContextualFragment(n);this.appendChild(c),queueMicrotask(()=>{this.suppressSlotChange=!1})};typeof i=="string"?s(i):i.then(s).catch(n=>{console.error("Failed to parse markdown content.",n,this)})}handleSlotChange(){this.suppressSlotChange||this.renderMarkdown()}render(){return S`<slot @slotchange=${this.handleSlotChange}></slot>`}};He.css=Ms;f([m({type:Number,attribute:"tab-size"})],He.prototype,"tabSize",2);He=f([B("wa-markdown")],He);var Xs=z`
  :host {
    display: block;
    color: var(--wa-color-text-normal);
    -webkit-user-select: none;
    user-select: none;

    position: relative;
    display: flex;
    align-items: center;
    font: inherit;
    padding: 0.5em 1em 0.5em 0.25em;
    line-height: var(--wa-line-height-condensed);
    transition: fill var(--wa-transition-normal) var(--wa-transition-easing);
    cursor: pointer;
  }

  :host(:focus) {
    outline: none;
  }

  @media (hover: hover) {
    :host(:not(:state(disabled), :state(current)):is(:state(hover), :hover)) {
      background-color: var(--wa-color-neutral-fill-normal);
      color: var(--wa-color-neutral-on-normal);
    }
  }

  :host(:state(current)),
  :host(:state(disabled):state(current)) {
    background-color: var(--wa-color-brand-fill-loud);
    color: var(--wa-color-brand-on-loud);
    opacity: 1;
  }

  :host(:state(disabled)) {
    outline: none;
    opacity: 0.5;
    cursor: not-allowed;
  }

  .label {
    flex: 1 1 auto;
    display: inline-block;
  }

  .check {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--wa-font-size-smaller);
    visibility: hidden;
    width: 2em;
  }

  :host(:state(selected)) .check {
    visibility: visible;
  }

  .start,
  .end {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
  }

  .start::slotted(*) {
    margin-inline-end: 0.5em;
  }

  .end::slotted(*) {
    margin-inline-start: 0.5em;
  }

  @media (forced-colors: active) {
    :host(:hover:not([aria-disabled='true'])) {
      outline: dashed 1px SelectedItem;
      outline-offset: -1px;
    }
  }
`;function We(r,t=0){if(!r||!globalThis.Node)return"";if(typeof r[Symbol.iterator]=="function")return(Array.isArray(r)?r:[...r]).map(i=>We(i,--t)).join("");let e=r;if(e.nodeType===Node.TEXT_NODE)return e.textContent??"";if(e.nodeType===Node.ELEMENT_NODE){let o=e;if(o.hasAttribute("slot")||o.matches("style, script"))return"";if(o instanceof HTMLSlotElement){let i=o.assignedNodes({flatten:!0});if(i.length>0)return We(i,--t)}return t>-1?We(o,--t):o.textContent??""}return e.hasChildNodes()?We(e.childNodes,--t):""}var gt=class extends Z{constructor(){super(...arguments),this.localize=new st(this),this.cachedDefaultLabel="",this.isInitialized=!1,this.isDefaultLabelDirty=!0,this.current=!1,this.value="",this.disabled=!1,this.selected=!1,this.defaultSelected=!1,this._label="",this.handleHover=r=>{r.type==="mouseenter"?this.customStates.set("hover",!0):r.type==="mouseleave"&&this.customStates.set("hover",!1)}}set label(r){let t=this._label;this._label=r||"",this._label!==t&&this.requestUpdate("label",t)}get label(){return this._label?this._label:this.defaultLabel}get defaultLabel(){return(this.isDefaultLabelDirty||!this.cachedDefaultLabel)&&this.updateDefaultLabel(),this.cachedDefaultLabel}connectedCallback(){super.connectedCallback(),this.setAttribute("role","option"),this.setAttribute("aria-selected","false"),this.addEventListener("mouseenter",this.handleHover),this.addEventListener("mouseleave",this.handleHover)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("mouseenter",this.handleHover),this.removeEventListener("mouseleave",this.handleHover)}handleDefaultSlotChange(){this.isDefaultLabelDirty=!0,this.isInitialized?(customElements.whenDefined("wa-select").then(()=>{let r=this.closest("wa-select");r&&r.handleDefaultSlotChange()}),customElements.whenDefined("wa-combobox").then(()=>{let r=this.closest("wa-combobox");r&&r.handleDefaultSlotChange()})):this.isInitialized=!0}willUpdate(r){if(r.has("defaultSelected")&&!this.closest("wa-combobox, wa-select")?.hasInteracted&&this.defaultSelected){let t=this.selected;this.selected=this.defaultSelected,this.requestUpdate("selected",t)}super.willUpdate(r)}updated(r){super.updated(r),r.has("disabled")&&(this.setAttribute("aria-disabled",this.disabled?"true":"false"),this.customStates.set("disabled",this.disabled)),r.has("selected")&&(this.setAttribute("aria-selected",this.selected?"true":"false"),this.customStates.set("selected",this.selected)),r.has("value")&&(typeof this.value!="string"&&(this.value=String(this.value)),this.handleDefaultSlotChange()),r.has("current")&&this.customStates.set("current",this.current)}firstUpdated(r){if(super.firstUpdated(r),this.selected&&!this.defaultSelected){let t=this.closest("wa-select, wa-combobox");t&&!t.hasInteracted&&t.selectionChanged?.()}}updateDefaultLabel(){let r=this.cachedDefaultLabel;this.cachedDefaultLabel=We(this).trim(),this.isDefaultLabelDirty=!1;let t=this.cachedDefaultLabel!==r;return!this._label&&t&&this.requestUpdate("label",r),t}render(){return S`
      ${this.selected?S`<wa-icon
            part="checked-icon"
            class="check"
            name="check"
            library="system"
            variant="solid"
            aria-hidden="true"
          ></wa-icon>`:S`<span part="checked-icon" class="check" aria-hidden="true"></span>`}
      <slot part="start" name="start" class="start"></slot>
      <slot part="label" class="label" @slotchange=${this.handleDefaultSlotChange}></slot>
      <slot part="end" name="end" class="end"></slot>
    `}};gt.css=Xs;f([Q(".label")],gt.prototype,"defaultSlot",2);f([K()],gt.prototype,"current",2);f([m({reflect:!0})],gt.prototype,"value",2);f([m({type:Boolean})],gt.prototype,"disabled",2);f([m({type:Boolean,attribute:!1})],gt.prototype,"selected",2);f([m({type:Boolean,attribute:"selected"})],gt.prototype,"defaultSelected",2);f([m()],gt.prototype,"label",1);gt=f([B("wa-option")],gt);var Qs=z`
  :host {
    --tag-max-size: 10ch;
    --show-duration: 100ms;
    --hide-duration: 100ms;
  }

  /* Add ellipses to multi select options */
  :host wa-tag::part(content) {
    display: initial;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    max-width: var(--tag-max-size);
  }

  :host .disabled [part~='combobox'] {
    opacity: 0.5;
    cursor: not-allowed;
    outline: none;
  }

  :host .enabled:is(.open, :focus-within) [part~='combobox'] {
    outline-color: var(--wa-color-focus);
  }

  /** The popup */
  .select {
    flex: 1 1 auto;
    display: inline-flex;
    width: 100%;
    position: relative;
    vertical-align: middle;

    /* Pass through from select to the popup */
    --show-duration: inherit;
    --hide-duration: inherit;

    &::part(popup) {
      z-index: 900;
    }

    &[data-current-placement^='top']::part(popup) {
      transform-origin: bottom;
    }

    &[data-current-placement^='bottom']::part(popup) {
      transform-origin: top;
    }
  }

  /* Combobox */
  .combobox {
    flex: 1;
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    justify-content: start;

    min-height: var(--wa-form-control-height);

    background-color: var(--wa-form-control-background-color);
    border-color: var(--wa-form-control-border-color);
    border-radius: var(--wa-form-control-border-radius);
    border-style: var(--wa-form-control-border-style);
    border-width: var(--wa-form-control-border-width);
    color: var(--wa-form-control-value-color);
    cursor: pointer;
    font-family: inherit;
    font-weight: var(--wa-form-control-value-font-weight);
    line-height: var(--wa-form-control-value-line-height);
    overflow: hidden;
    padding: 0 var(--wa-form-control-padding-inline);
    position: relative;
    vertical-align: middle;
    transition:
      background-color var(--wa-transition-normal),
      border-color var(--wa-transition-normal),
      outline-color var(--wa-transition-fast);
    transition-timing-function: var(--wa-transition-easing);
    outline: var(--wa-focus-ring-style) var(--wa-focus-ring-width) transparent;
    outline-offset: var(--wa-focus-ring-offset);

    /* Pills */
    :host([pill]) & {
      border-radius: var(--wa-border-radius-pill);
    }
  }

  /* Appearance modifiers */
  :host([appearance='outlined']) .combobox {
    background-color: var(--wa-form-control-background-color);
    border-color: var(--wa-form-control-border-color);
  }

  :host([appearance='filled']) .combobox {
    background-color: var(--wa-color-neutral-fill-quiet);
    border-color: var(--wa-color-neutral-fill-quiet);
  }

  :host([appearance='filled-outlined']) .combobox {
    background-color: var(--wa-color-neutral-fill-quiet);
    border-color: var(--wa-form-control-border-color);
  }

  .display-input {
    position: relative;
    width: 100%;
    font: inherit;
    border: none;
    background: none;
    line-height: var(--wa-form-control-value-line-height);
    color: var(--wa-form-control-value-color);
    cursor: inherit;
    overflow: hidden;
    padding: 0;
    margin: 0;
    -webkit-appearance: none;

    &:focus {
      outline: none;
    }

    &::placeholder {
      color: var(--wa-form-control-placeholder-color);
    }
  }

  /* Manage spacing when tags are present */
  :host([multiple]) {
    --_padding-with-tags: calc(var(--wa-form-control-height) * 0.1 - var(--wa-form-control-border-width));

    & .combobox:has(.tags wa-tag) {
      padding-block: var(--_padding-with-tags);
      padding-inline-start: var(--_padding-with-tags);
    }
  }

  /* Visually hide the display input when multiple is enabled */
  :host([multiple]) .combobox:has(.tags wa-tag) .display-input {
    position: absolute;
    z-index: -1;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
  }

  .value-input {
    position: absolute;
    z-index: -1;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    padding: 0;
    margin: 0;
  }

  .tags {
    display: flex;
    flex: 1;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25em;

    &::slotted(wa-tag) {
      cursor: pointer !important;
    }

    .disabled &,
    .disabled &::slotted(wa-tag) {
      cursor: not-allowed !important;
    }
  }

  /* Start and End */

  .start,
  .end {
    flex: 0;
    display: inline-flex;
    align-items: center;
    color: var(--wa-color-neutral-on-quiet);
  }

  .end::slotted(*) {
    margin-inline-start: var(--wa-form-control-padding-inline);
  }

  .start::slotted(*) {
    margin-inline-end: var(--wa-form-control-padding-inline);
  }

  :host([multiple]) .combobox:has(.tags wa-tag) .start::slotted(*) {
    margin-inline-start: calc(var(--wa-form-control-padding-inline) - var(--_padding-with-tags));
  }

  /* Clear button */
  [part~='clear-button'] {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: inherit;
    color: var(--wa-color-neutral-on-quiet);
    border: none;
    background: none;
    padding: 0;
    transition: color var(--wa-transition-normal);
    cursor: pointer;
    margin-inline-start: var(--wa-form-control-padding-inline);

    &:focus {
      outline: none;
    }

    @media (hover: hover) {
      &:hover {
        color: color-mix(in oklab, currentColor, var(--wa-color-mix-hover));
      }
    }

    &:active {
      color: color-mix(in oklab, currentColor, var(--wa-color-mix-active));
    }
  }

  /* Expand icon */
  .expand-icon {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    color: var(--wa-color-neutral-on-quiet);
    transition: rotate var(--wa-transition-slow) ease;
    rotate: 0deg;
    margin-inline-start: var(--wa-form-control-padding-inline);

    .open & {
      rotate: -180deg;
    }
  }

  /* Listbox */
  .listbox {
    display: block;
    position: relative;
    font: inherit;
    box-shadow: var(--wa-shadow-m);
    background: var(--wa-color-surface-raised);
    border-color: var(--wa-color-surface-border);
    border-radius: var(--wa-border-radius-m);
    border-style: var(--wa-border-style);
    border-width: var(--wa-border-width-s);
    padding-block: 0.5em;
    padding-inline: 0;
    overflow: auto;
    overscroll-behavior: none;

    /* Make sure it adheres to the popup's auto size */
    max-width: var(--auto-size-available-width);
    max-height: var(--auto-size-available-height);

    &::slotted(wa-divider) {
      --spacing: 0.5em;
    }
  }

  slot:not([name])::slotted(small) {
    display: block;
    font-size: var(--wa-font-size-smaller);
    font-weight: var(--wa-font-weight-semibold);
    color: var(--wa-color-text-quiet);
    padding-block: 0.5em;
    padding-inline: 2.25em;
  }
`;function zl(r,t){return{top:Math.round(r.getBoundingClientRect().top-t.getBoundingClientRect().top),left:Math.round(r.getBoundingClientRect().left-t.getBoundingClientRect().left)}}function Js(r,t,e="vertical",o="smooth"){let i=zl(r,t),s=i.top+t.scrollTop,n=i.left+t.scrollLeft,c=t.scrollLeft,h=t.scrollLeft+t.offsetWidth,g=t.scrollTop,l=t.scrollTop+t.offsetHeight;(e==="horizontal"||e==="both")&&(n<c?t.scrollTo({left:n,behavior:o}):n+r.clientWidth>h&&t.scrollTo({left:n-t.offsetWidth+r.clientWidth,behavior:o})),(e==="vertical"||e==="both")&&(s<g?t.scrollTo({top:s,behavior:o}):s+r.clientHeight>l&&t.scrollTo({top:s-t.offsetHeight+r.clientHeight,behavior:o}))}var Gt=[];function tn(r){Gt.push(r)}function en(r){for(let t=Gt.length-1;t>=0;t--)if(Gt[t]===r){Gt.splice(t,1);break}}function rn(r){return Gt.length>0&&Gt[Gt.length-1]===r}var on=class extends Event{constructor(){super("wa-show",{bubbles:!0,cancelable:!0,composed:!0})}};var sn=class extends Event{constructor(r){super("wa-hide",{bubbles:!0,cancelable:!0,composed:!0}),this.detail=r}};var nn=class extends Event{constructor(){super("wa-after-hide",{bubbles:!0,cancelable:!1,composed:!0})}};var an=class extends Event{constructor(){super("wa-after-show",{bubbles:!0,cancelable:!1,composed:!0})}};function So(r,t){return new Promise(e=>{function o(i){i.target===r&&(r.removeEventListener(t,o),e())}r.addEventListener(t,o)})}function Eo(r,t){return new Promise(e=>{let o=new AbortController,{signal:i}=o;if(r.classList.contains(t))return;r.classList.add(t);let s=!1,n=()=>{s||(s=!0,r.classList.remove(t),e(),o.abort())};r.addEventListener("animationend",n,{once:!0,signal:i}),r.addEventListener("animationcancel",n,{once:!0,signal:i}),requestAnimationFrame(()=>{!s&&r.getAnimations().length===0&&n()})})}var ln=(r={})=>{let{validationElement:t,validationProperty:e}=r;t||(t=Object.assign(document.createElement("input"),{required:!0})),e||(e="value");let o={observedAttributes:["required"],message:t.validationMessage,checkValidity(i){let s={message:"",isValid:!0,invalidKeys:[]};return(i.required??i.hasAttribute("required"))&&!i[e]&&(s.message=typeof o.message=="function"?o.message(i):o.message||"",s.isValid=!1,s.invalidKeys.push("valueMissing")),s}};return o};var q=class extends tt{constructor(){super(...arguments),this.assumeInteractionOn=["blur","input"],this.cachedOptions=null,this.hasSlotController=new yt(this,"hint","label"),this.localize=new st(this),this.selectionOrder=new Map,this.typeToSelectString="",this.slotChangePending=!1,this.displayLabel="",this.selectedOptions=[],this.name="",this._defaultValue=null,this.size="medium",this.placeholder="",this.multiple=!1,this.maxOptionsVisible=3,this.disabled=!1,this.withClear=!1,this.open=!1,this.appearance="outlined",this.pill=!1,this.label="",this.placement="bottom",this.hint="",this.withLabel=!1,this.withHint=!1,this.required=!1,this.getTag=r=>S`
        <wa-tag
          part="tag"
          exportparts="
            base:tag__base,
            content:tag__content,
            remove-button:tag__remove-button,
            remove-button__base:tag__remove-button__base
          "
          ?pill=${this.pill}
          size=${this.size}
          with-remove
          data-value=${r.value}
          @wa-remove=${t=>this.handleTagRemove(t,r)}
        >
          ${r.label}
        </wa-tag>
      `,this.handleDocumentFocusIn=r=>{let t=r.composedPath();this&&!t.includes(this)&&this.hide()},this.handleDocumentKeyDown=r=>{let t=r.target,e=t.closest('[part~="clear-button"]')!==null,o=t.closest("wa-button")!==null;if(!(e||o)){if(r.key==="Escape"&&this.open&&rn(this)&&(r.preventDefault(),r.stopPropagation(),this.hide(),this.displayInput.focus({preventScroll:!0})),r.key==="Enter"||r.key===" "&&this.typeToSelectString===""){if(r.preventDefault(),r.stopImmediatePropagation(),!this.open){this.show();return}this.currentOption&&!this.currentOption.disabled&&(this.valueHasChanged=!0,this.hasInteracted=!0,this.multiple?this.toggleOptionSelection(this.currentOption):this.setSelectedOptions(this.currentOption),this.updateComplete.then(()=>{this.dispatchEvent(new InputEvent("input",{bubbles:!0,composed:!0})),this.dispatchEvent(new Event("change",{bubbles:!0,composed:!0}))}),this.multiple||(this.hide(),this.displayInput.focus({preventScroll:!0})));return}if(["ArrowUp","ArrowDown","Home","End"].includes(r.key)){let i=this.getAllOptions(),s=i.indexOf(this.currentOption),n=Math.max(0,s);if(r.preventDefault(),!this.open&&(this.show(),this.currentOption))return;r.key==="ArrowDown"?(n=s+1,n>i.length-1&&(n=0)):r.key==="ArrowUp"?(n=s-1,n<0&&(n=i.length-1)):r.key==="Home"?n=0:r.key==="End"&&(n=i.length-1),this.setCurrentOption(i[n])}if(r.key?.length===1||r.key==="Backspace"){let i=this.getAllOptions();if(r.metaKey||r.ctrlKey||r.altKey)return;if(!this.open){if(r.key==="Backspace")return;this.show()}r.stopPropagation(),r.preventDefault(),clearTimeout(this.typeToSelectTimeout),this.typeToSelectTimeout=window.setTimeout(()=>this.typeToSelectString="",1e3),r.key==="Backspace"?this.typeToSelectString=this.typeToSelectString.slice(0,-1):this.typeToSelectString+=r.key.toLowerCase();for(let s of i)if(s.label.toLowerCase().startsWith(this.typeToSelectString)){this.setCurrentOption(s);break}}}},this.handleDocumentMouseDown=r=>{let t=r.composedPath();this&&!t.includes(this)&&this.hide()}}static get validators(){let r=[];return[...super.validators,...r]}get validationTarget(){return this.valueInput}set defaultValue(r){this._defaultValue=this.convertDefaultValue(r)}get defaultValue(){return this.convertDefaultValue(this._defaultValue)}rawValuesEqual(r,t){return r==null&&t==null?!0:r==null||t==null||r.length!==t.length?!1:r.every((e,o)=>e===t[o])}convertDefaultValue(r){return!(this.multiple||this.hasAttribute("multiple"))&&Array.isArray(r)&&(r=r[0]),r}set value(r){let t=this.value;r instanceof FormData&&(r=r.getAll(this.name)),r!=null&&!Array.isArray(r)&&(r=[r]);let e=this._value;this._value=r??null,this.rawValuesEqual(e,this._value)||(this.valueHasChanged=!0,this.requestUpdate("value",t))}get value(){let r=this._value??this.defaultValue??null;r!=null&&(r=Array.isArray(r)?r:[r]),this.optionValues=new Set(this.getAllOptions().filter(e=>!e.disabled).map(e=>e.value));let t=r;return r!=null&&(t=r.filter(e=>this.optionValues.has(e)),t=this.multiple?t:t[0],t=t??null),t}connectedCallback(){super.connectedCallback(),this.processSlotChange(),this.open=!1}disconnectedCallback(){super.disconnectedCallback(),this.removeOpenListeners(),this.cachedOptions=null}updateDefaultValue(){let t=this.getAllOptions().filter(e=>e.hasAttribute("selected")||e.defaultSelected);if(t.length>0){let e=t.map(o=>o.value);this._defaultValue=this.multiple?e:e[0]}this.hasAttribute("value")&&(this._defaultValue=this.getAttribute("value")||null)}addOpenListeners(){document.addEventListener("focusin",this.handleDocumentFocusIn),document.addEventListener("keydown",this.handleDocumentKeyDown),document.addEventListener("mousedown",this.handleDocumentMouseDown),tn(this),this.getRootNode()!==document&&this.getRootNode().addEventListener("focusin",this.handleDocumentFocusIn)}removeOpenListeners(){document.removeEventListener("focusin",this.handleDocumentFocusIn),document.removeEventListener("keydown",this.handleDocumentKeyDown),document.removeEventListener("mousedown",this.handleDocumentMouseDown),en(this),this.getRootNode()!==document&&this.getRootNode().removeEventListener("focusin",this.handleDocumentFocusIn)}handleFocus(){this.displayInput.setSelectionRange(0,0)}handleLabelClick(){this.displayInput.focus()}handleComboboxClick(r){r.preventDefault()}handleComboboxMouseDown(r){let e=r.composedPath().some(o=>o instanceof Element&&o.tagName.toLowerCase()==="wa-button");this.disabled||e||(r.preventDefault(),this.displayInput.focus({preventScroll:!0}),this.open=!this.open)}handleComboboxKeyDown(r){r.stopPropagation(),this.handleDocumentKeyDown(r)}handleClearClick(r){r.stopPropagation(),this.hasInteracted=!0,this.valueHasChanged=!0,this.value!==null&&(this.displayLabel="",this.selectionOrder.clear(),this.setSelectedOptions([]),this.displayInput.focus({preventScroll:!0}),this.updateComplete.then(()=>{this.dispatchEvent(new yr),this.dispatchEvent(new InputEvent("input",{bubbles:!0,composed:!0})),this.dispatchEvent(new Event("change",{bubbles:!0,composed:!0}))}))}handleClearMouseDown(r){r.stopPropagation(),r.preventDefault()}handleOptionClick(r){let e=r.target.closest("wa-option");e&&!e.disabled&&(this.hasInteracted=!0,this.valueHasChanged=!0,this.multiple?this.toggleOptionSelection(e):this.setSelectedOptions(e),this.updateComplete.then(()=>this.displayInput.focus({preventScroll:!0})),this.requestUpdate("value"),this.updateComplete.then(()=>{this.dispatchEvent(new InputEvent("input",{bubbles:!0,composed:!0})),this.dispatchEvent(new Event("change",{bubbles:!0,composed:!0}))}),this.multiple||(this.hide(),this.displayInput.focus({preventScroll:!0})))}handleDefaultSlotChange(){this.slotChangePending||(this.slotChangePending=!0,queueMicrotask(()=>{this.slotChangePending=!1,this.processSlotChange()}))}processSlotChange(){customElements.get("wa-option")||customElements.whenDefined("wa-option").then(()=>this.handleDefaultSlotChange()),this.cachedOptions=null;let r=this.getAllOptions();this.updateDefaultValue();let t=this.value;if(t==null||!this.valueHasChanged&&!this.hasInteracted){this.selectionChanged();return}Array.isArray(t)||(t=[t]);let e=r.filter(o=>t.includes(o.value));this.setSelectedOptions(e)}handleTagRemove(r,t){if(r.stopPropagation(),this.disabled)return;this.hasInteracted=!0,this.valueHasChanged=!0;let e=t;if(!e){let o=r.target.closest("wa-tag[data-value]");if(o){let i=o.dataset.value;e=this.selectedOptions.find(s=>s.value===i)}}e&&(this.toggleOptionSelection(e,!1),this.updateComplete.then(()=>{this.dispatchEvent(new InputEvent("input",{bubbles:!0,composed:!0})),this.dispatchEvent(new Event("change",{bubbles:!0,composed:!0}))}))}getAllOptions(){return this.cachedOptions?this.cachedOptions:this?.querySelectorAll?(this.cachedOptions=[...this.querySelectorAll("wa-option")],this.cachedOptions):[]}getFirstOption(){return this.querySelector("wa-option")}setCurrentOption(r){this.getAllOptions().forEach(e=>{e.current=!1,e.tabIndex=-1}),r&&(this.currentOption=r,r.current=!0,r.tabIndex=0,r.focus({preventScroll:!0}))}setSelectedOptions(r){let t=this.getAllOptions(),e=Array.isArray(r)?r:[r];t.forEach(o=>{e.includes(o)||(o.selected=!1)}),e.length&&e.forEach(o=>o.selected=!0),this.selectionChanged()}toggleOptionSelection(r,t){t===!0||t===!1?r.selected=t:r.selected=!r.selected,this.selectionChanged()}selectionChanged(){let t=this.getAllOptions().filter(n=>{if(!this.hasInteracted&&!this.valueHasChanged){let c=this.defaultValue,h=Array.isArray(c)?c:[c];return n.hasAttribute("selected")||n.defaultSelected||n.selected||h?.includes(n.value)}return n.selected}),e=new Set(t.map(n=>n.value));for(let n of this.selectionOrder.keys())e.has(n)||this.selectionOrder.delete(n);let i=(this.selectionOrder.size>0?Math.max(...this.selectionOrder.values()):-1)+1;for(let n of t)this.selectionOrder.has(n.value)||this.selectionOrder.set(n.value,i++);this.selectedOptions=t.sort((n,c)=>{let h=this.selectionOrder.get(n.value)??0,g=this.selectionOrder.get(c.value)??0;return h-g});let s=new Set(this.selectedOptions.map(n=>n.value));if(s.size>0||this._value){let n=this._value;if(this._value==null){let c=this.defaultValue??[];this._value=Array.isArray(c)?c:[c]}this._value=this._value?.filter(c=>!this.optionValues?.has(c))??null,this._value?.unshift(...s),this.requestUpdate("value",n)}if(this.multiple)this.placeholder&&!this.value?.length?this.displayLabel="":this.displayLabel=this.localize.term("numOptionsSelected",this.selectedOptions.length);else{let n=this.selectedOptions[0];this.displayLabel=n?.label??""}this.updateComplete.then(()=>{this.updateValidity()})}get tags(){return this.selectedOptions.map((r,t)=>{if(t<this.maxOptionsVisible||this.maxOptionsVisible<=0){let e=this.getTag(r,t);return e?typeof e=="string"?dr(e):e:null}else if(t===this.maxOptionsVisible)return S`
          <wa-tag
            part="tag"
            exportparts="
              base:tag__base,
              content:tag__content,
              remove-button:tag__remove-button,
              remove-button__base:tag__remove-button__base
            "
            >+${this.selectedOptions.length-t}</wa-tag
          >
        `;return null})}updated(r){super.updated(r),(r.has("value")||r.has("displayLabel"))&&this.customStates.set("blank",!this.value&&!this.displayLabel)}handleDisabledChange(){this.disabled&&this.open&&(this.open=!1)}handleValueChange(){let r=this.getAllOptions(),t=Array.isArray(this.value)?this.value:[this.value],e=r.filter(o=>t.includes(o.value));this.setSelectedOptions(e),this.updateValidity()}async handleOpenChange(){if(this.open&&!this.disabled){this.setCurrentOption(this.selectedOptions[0]||this.getFirstOption());let r=new on;if(this.dispatchEvent(r),r.defaultPrevented){this.open=!1;return}this.addOpenListeners(),this.listbox.hidden=!1,this.popup.active=!0,requestAnimationFrame(()=>{this.setCurrentOption(this.currentOption)}),await Eo(this.popup.popup,"show"),this.currentOption&&Js(this.currentOption,this.listbox,"vertical","auto"),this.dispatchEvent(new an)}else{let r=new sn;if(this.dispatchEvent(r),r.defaultPrevented){this.open=!1;return}this.removeOpenListeners(),await Eo(this.popup.popup,"hide"),this.listbox.hidden=!0,this.popup.active=!1,this.dispatchEvent(new nn)}}async show(){if(this.open||this.disabled){this.open=!1;return}return this.open=!0,So(this,"wa-after-show")}async hide(){if(!this.open||this.disabled){this.open=!1;return}return this.open=!1,So(this,"wa-after-hide")}focus(r){this.displayInput.focus(r)}blur(){this.displayInput.blur()}formResetCallback(){this.selectionOrder.clear(),this.value=this.defaultValue,super.formResetCallback(),this.handleValueChange(),this.updateComplete.then(()=>{this.dispatchEvent(new InputEvent("input",{bubbles:!0,composed:!0})),this.dispatchEvent(new Event("change",{bubbles:!0,composed:!0}))})}render(){let r=this.hasUpdated?this.hasSlotController.test("label"):this.withLabel,t=this.hasUpdated?this.hasSlotController.test("hint"):this.withHint,e=this.label?!0:!!r,o=this.hint?!0:!!t,i=(this.hasUpdated||!0)&&this.withClear&&!this.disabled&&(this.displayLabel||this.value&&this.value.length>0);return S`
      <div
        part="form-control"
        class=${et({"form-control":!0,"form-control-has-label":e})}
      >
        <label
          id="label"
          part="form-control-label label"
          class=${et({label:!0,"has-label":e})}
          aria-hidden=${e?"false":"true"}
          @click=${this.handleLabelClick}
        >
          <slot name="label">${this.label}</slot>
        </label>

        <div part="form-control-input" class="form-control-input">
          <wa-popup
            class=${et({select:!0,open:this.open,disabled:this.disabled,enabled:!this.disabled,multiple:this.multiple})}
            placement=${this.placement}
            flip
            shift
            sync="width"
            auto-size="vertical"
            auto-size-padding="10"
          >
            <div
              part="combobox"
              class="combobox"
              slot="anchor"
              @keydown=${this.handleComboboxKeyDown}
              @mousedown=${this.handleComboboxMouseDown}
              @click=${this.handleComboboxClick}
            >
              <slot part="start" name="start" class="start"></slot>

              <input
                part="display-input"
                class="display-input"
                type="text"
                placeholder=${this.placeholder}
                .disabled=${this.disabled}
                .value=${this.displayLabel}
                ?required=${this.required}
                autocomplete="off"
                spellcheck="false"
                autocapitalize="off"
                readonly
                aria-invalid=${!this.validity.valid}
                aria-controls="listbox"
                aria-expanded=${this.open?"true":"false"}
                aria-haspopup="listbox"
                aria-labelledby="label"
                aria-disabled=${this.disabled?"true":"false"}
                aria-describedby="hint"
                role="combobox"
                tabindex="0"
                @focus=${this.handleFocus}
              />

              <!-- Tags need to wait for first hydration before populating otherwise it will create a hydration mismatch. -->
              ${this.multiple&&this.hasUpdated?S`<div part="tags" class="tags" @wa-remove=${this.handleTagRemove}>${this.tags}</div>`:""}

              <input
                class="value-input"
                type="text"
                ?disabled=${this.disabled}
                ?required=${this.required}
                .value=${Array.isArray(this.value)?this.value.join(", "):this.value}
                tabindex="-1"
                aria-hidden="true"
                @focus=${()=>this.focus()}
              />

              ${i?S`
                    <button
                      part="clear-button"
                      type="button"
                      aria-label=${this.localize.term("clearEntry")}
                      @mousedown=${this.handleClearMouseDown}
                      @click=${this.handleClearClick}
                      tabindex="-1"
                    >
                      <slot name="clear-icon">
                        <wa-icon name="circle-xmark" library="system" variant="regular"></wa-icon>
                      </slot>
                    </button>
                  `:""}

              <slot name="end" part="end" class="end"></slot>

              <slot name="expand-icon" part="expand-icon" class="expand-icon">
                <wa-icon library="system" name="chevron-down" variant="solid"></wa-icon>
              </slot>
            </div>

            <div
              id="listbox"
              role="listbox"
              aria-expanded=${this.open?"true":"false"}
              aria-multiselectable=${this.multiple?"true":"false"}
              aria-labelledby="label"
              part="listbox"
              class="listbox"
              tabindex="-1"
              @mouseup=${this.handleOptionClick}
            >
              <slot @slotchange=${this.handleDefaultSlotChange}></slot>
            </div>
          </wa-popup>
        </div>

        <slot
          id="hint"
          name="hint"
          part="hint"
          class=${et({"has-slotted":o})}
          aria-hidden=${o?"false":"true"}
          >${this.hint}</slot
        >
      </div>
    `}};q.css=[Qs,he,ht];f([Q(".select")],q.prototype,"popup",2);f([Q(".combobox")],q.prototype,"combobox",2);f([Q(".display-input")],q.prototype,"displayInput",2);f([Q(".value-input")],q.prototype,"valueInput",2);f([Q(".listbox")],q.prototype,"listbox",2);f([K()],q.prototype,"displayLabel",2);f([K()],q.prototype,"currentOption",2);f([K()],q.prototype,"selectedOptions",2);f([m({reflect:!0})],q.prototype,"name",2);f([m({attribute:!1})],q.prototype,"defaultValue",1);f([m({attribute:"value",reflect:!1})],q.prototype,"value",1);f([m({reflect:!0})],q.prototype,"size",2);f([m()],q.prototype,"placeholder",2);f([m({type:Boolean,reflect:!0})],q.prototype,"multiple",2);f([m({attribute:"max-options-visible",type:Number})],q.prototype,"maxOptionsVisible",2);f([m({type:Boolean})],q.prototype,"disabled",2);f([m({attribute:"with-clear",type:Boolean})],q.prototype,"withClear",2);f([m({type:Boolean,reflect:!0})],q.prototype,"open",2);f([m({reflect:!0})],q.prototype,"appearance",2);f([m({type:Boolean,reflect:!0})],q.prototype,"pill",2);f([m()],q.prototype,"label",2);f([m({reflect:!0})],q.prototype,"placement",2);f([m({attribute:"hint"})],q.prototype,"hint",2);f([m({attribute:"with-label",type:Boolean})],q.prototype,"withLabel",2);f([m({attribute:"with-hint",type:Boolean})],q.prototype,"withHint",2);f([m({type:Boolean,reflect:!0})],q.prototype,"required",2);f([m({attribute:!1})],q.prototype,"getTag",2);f([nt("disabled",{waitUntilFirstUpdate:!0})],q.prototype,"handleDisabledChange",1);f([nt("value",{waitUntilFirstUpdate:!0})],q.prototype,"handleValueChange",1);f([nt("open",{waitUntilFirstUpdate:!0})],q.prototype,"handleOpenChange",1);q=f([B("wa-select")],q);q.disableWarning?.("change-in-update");var cn=class extends Event{constructor(){super("wa-remove",{bubbles:!0,cancelable:!1,composed:!0})}};var un=z`
  @layer wa-component {
    :host {
      display: inline-flex;
      gap: 0.5em;
      border-radius: var(--wa-border-radius-m);
      align-items: center;
      background-color: var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet));
      border-color: var(--wa-color-border-normal, var(--wa-color-neutral-border-normal));
      border-style: var(--wa-border-style);
      border-width: var(--wa-border-width-s);
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      font-size: inherit;
      line-height: 1;
      white-space: nowrap;
      user-select: none;
      -webkit-user-select: none;
      height: calc(var(--wa-form-control-height) * 0.8);
      line-height: calc(var(--wa-form-control-height) - var(--wa-form-control-border-width) * 2);
      padding: 0 0.75em;
    }

    /* Appearance modifiers */
    :host([appearance='outlined']) {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: transparent;
      border-color: var(--wa-color-border-loud, var(--wa-color-neutral-border-loud));
    }

    :host([appearance='filled']) {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet));
      border-color: transparent;
    }

    :host([appearance='filled-outlined']) {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet));
      border-color: var(--wa-color-border-normal, var(--wa-color-neutral-border-normal));
    }

    :host([appearance='accent']) {
      color: var(--wa-color-on-loud, var(--wa-color-neutral-on-loud));
      background-color: var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud));
      border-color: transparent;
    }
  }

  .content {
    font-size: var(--wa-font-size-smaller);
  }

  [part='remove-button'] {
    line-height: 1;
  }

  [part='remove-button']::part(base) {
    padding: 0;
    height: 1em;
    width: 1em;
    color: currentColor;
  }

  @media (hover: hover) {
    :host(:hover) > [part='remove-button']::part(base) {
      background-color: transparent;
      color: color-mix(in oklab, currentColor, var(--wa-color-mix-hover));
    }
  }

  :host(:active) > [part='remove-button']::part(base) {
    background-color: transparent;
    color: color-mix(in oklab, currentColor, var(--wa-color-mix-active));
  }

  /*
   * Pill modifier
   */
  :host([pill]) {
    border-radius: var(--wa-border-radius-pill);
  }
`;var Ft=class extends Z{constructor(){super(...arguments),this.localize=new st(this),this.variant="neutral",this.appearance="filled-outlined",this.size="medium",this.pill=!1,this.withRemove=!1}handleRemoveClick(){this.dispatchEvent(new cn)}render(){return S`
      <slot part="content" class="content"></slot>

      ${this.withRemove?S`
            <wa-button
              part="remove-button"
              exportparts="base:remove-button__base"
              class="remove"
              appearance="plain"
              @click=${this.handleRemoveClick}
              tabindex="-1"
            >
              <wa-icon name="xmark" library="system" variant="solid" label=${this.localize.term("remove")}></wa-icon>
            </wa-button>
          `:""}
    `}};Ft.css=[un,le,ht];f([m({reflect:!0})],Ft.prototype,"variant",2);f([m({reflect:!0})],Ft.prototype,"appearance",2);f([m({reflect:!0})],Ft.prototype,"size",2);f([m({type:Boolean,reflect:!0})],Ft.prototype,"pill",2);f([m({attribute:"with-remove",type:Boolean})],Ft.prototype,"withRemove",2);Ft=f([B("wa-tag")],Ft);var hn=class extends Event{constructor(){super("wa-reposition",{bubbles:!0,cancelable:!1,composed:!0})}};var dn=z`
  :host {
    --arrow-color: black;
    --arrow-size: var(--wa-tooltip-arrow-size);
    --popup-border-width: 0px;
    --show-duration: 100ms;
    --hide-duration: 100ms;

    /*
     * These properties are computed to account for the arrow's dimensions after being rotated 45º. The constant
     * 0.7071 is derived from sin(45) to calculate the length of the arrow after rotation.
     *
     * The diamond will be translated inward by --arrow-base-offset, the border thickness, to centralise it on
     * the inner edge of the popup border. This also means we need to increase the size of the arrow by the
     * same amount to compensate.
     *
     * A diamond shaped clipping mask is used to avoid overlap of popup content. This extends slightly inward so
     * the popup border is covered with no sub-pixel rounding artifacts. The diamond corners are mitred at 22.5º
     * to properly merge any arrow border with the popup border. The constant 1.4142 is derived from 1 + tan(22.5).
     *
     */
    --arrow-base-offset: var(--popup-border-width);
    --arrow-size-diagonal: calc((var(--arrow-size) + var(--arrow-base-offset)) * 0.7071);
    --arrow-padding-offset: calc(var(--arrow-size-diagonal) - var(--arrow-size));
    --arrow-size-div: calc(var(--arrow-size-diagonal) * 2);
    --arrow-clipping-corner: calc(var(--arrow-base-offset) * 1.4142);

    display: contents;
  }

  .popup {
    position: absolute;
    isolation: isolate;
    max-width: var(--auto-size-available-width, none);
    max-height: var(--auto-size-available-height, none);

    /* Clear UA styles for [popover] */
    :where(&) {
      inset: unset;
      padding: unset;
      margin: unset;
      width: unset;
      height: unset;
      color: unset;
      background: unset;
      border: unset;
      overflow: unset;
    }
  }

  .popup-fixed {
    position: fixed;
  }

  .popup:not(.popup-active) {
    display: none;
  }

  .arrow {
    position: absolute;
    width: var(--arrow-size-div);
    height: var(--arrow-size-div);
    background: var(--arrow-color);
    z-index: 3;
    clip-path: polygon(
      var(--arrow-clipping-corner) 100%,
      var(--arrow-base-offset) calc(100% - var(--arrow-base-offset)),
      calc(var(--arrow-base-offset) - 2px) calc(100% - var(--arrow-base-offset)),
      calc(100% - var(--arrow-base-offset)) calc(var(--arrow-base-offset) - 2px),
      calc(100% - var(--arrow-base-offset)) var(--arrow-base-offset),
      100% var(--arrow-clipping-corner),
      100% 100%
    );
    rotate: 45deg;
  }

  :host([data-current-placement|='left']) .arrow {
    rotate: -45deg;
  }

  :host([data-current-placement|='right']) .arrow {
    rotate: 135deg;
  }

  :host([data-current-placement|='bottom']) .arrow {
    rotate: 225deg;
  }

  /* Hover bridge */
  .popup-hover-bridge:not(.popup-hover-bridge-visible) {
    display: none;
  }

  .popup-hover-bridge {
    position: fixed;
    z-index: 899;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    clip-path: polygon(
      var(--hover-bridge-top-left-x, 0) var(--hover-bridge-top-left-y, 0),
      var(--hover-bridge-top-right-x, 0) var(--hover-bridge-top-right-y, 0),
      var(--hover-bridge-bottom-right-x, 0) var(--hover-bridge-bottom-right-y, 0),
      var(--hover-bridge-bottom-left-x, 0) var(--hover-bridge-bottom-left-y, 0)
    );
  }

  /* Built-in animations */
  .show {
    animation: show var(--show-duration) ease;
  }

  .hide {
    animation: show var(--hide-duration) ease reverse;
  }

  @keyframes show {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .show-with-scale {
    animation: show-with-scale var(--show-duration) ease;
  }

  .hide-with-scale {
    animation: show-with-scale var(--hide-duration) ease reverse;
  }

  @keyframes show-with-scale {
    from {
      opacity: 0;
      scale: 0.8;
    }
    to {
      opacity: 1;
      scale: 1;
    }
  }
`;var Ct=Math.min,at=Math.max,Ye=Math.round,Ke=Math.floor,bt=r=>({x:r,y:r}),Ol={left:"right",right:"left",bottom:"top",top:"bottom"};function $r(r,t,e){return at(r,Ct(t,e))}function Zt(r,t){return typeof r=="function"?r(t):r}function Lt(r){return r.split("-")[0]}function Xt(r){return r.split("-")[1]}function $o(r){return r==="x"?"y":"x"}function Ar(r){return r==="y"?"height":"width"}function _t(r){let t=r[0];return t==="t"||t==="b"?"y":"x"}function Lr(r){return $o(_t(r))}function mn(r,t,e){e===void 0&&(e=!1);let o=Xt(r),i=Lr(r),s=Ar(i),n=i==="x"?o===(e?"end":"start")?"right":"left":o==="start"?"bottom":"top";return t.reference[s]>t.floating[s]&&(n=je(n)),[n,je(n)]}function gn(r){let t=je(r);return[Er(r),t,Er(t)]}function Er(r){return r.includes("start")?r.replace("start","end"):r.replace("end","start")}var pn=["left","right"],fn=["right","left"],Pl=["top","bottom"],Ml=["bottom","top"];function Il(r,t,e){switch(r){case"top":case"bottom":return e?t?fn:pn:t?pn:fn;case"left":case"right":return t?Pl:Ml;default:return[]}}function bn(r,t,e,o){let i=Xt(r),s=Il(Lt(r),e==="start",o);return i&&(s=s.map(n=>n+"-"+i),t&&(s=s.concat(s.map(Er)))),s}function je(r){let t=Lt(r);return Ol[t]+r.slice(t.length)}function Dl(r){return{top:0,right:0,bottom:0,left:0,...r}}function Ao(r){return typeof r!="number"?Dl(r):{top:r,right:r,bottom:r,left:r}}function Qt(r){let{x:t,y:e,width:o,height:i}=r;return{width:o,height:i,top:e,left:t,right:t+o,bottom:e+i,x:t,y:e}}function wn(r,t,e){let{reference:o,floating:i}=r,s=_t(t),n=Lr(t),c=Ar(n),h=Lt(t),g=s==="y",l=o.x+o.width/2-i.width/2,a=o.y+o.height/2-i.height/2,p=o[c]/2-i[c]/2,d;switch(h){case"top":d={x:l,y:o.y-i.height};break;case"bottom":d={x:l,y:o.y+o.height};break;case"right":d={x:o.x+o.width,y:a};break;case"left":d={x:o.x-i.width,y:a};break;default:d={x:o.x,y:o.y}}switch(Xt(t)){case"start":d[n]-=p*(e&&g?-1:1);break;case"end":d[n]+=p*(e&&g?-1:1);break}return d}async function vn(r,t){var e;t===void 0&&(t={});let{x:o,y:i,platform:s,rects:n,elements:c,strategy:h}=r,{boundary:g="clippingAncestors",rootBoundary:l="viewport",elementContext:a="floating",altBoundary:p=!1,padding:d=0}=Zt(t,r),u=Ao(d),_=c[p?a==="floating"?"reference":"floating":a],k=Qt(await s.getClippingRect({element:(e=await(s.isElement==null?void 0:s.isElement(_)))==null||e?_:_.contextElement||await(s.getDocumentElement==null?void 0:s.getDocumentElement(c.floating)),boundary:g,rootBoundary:l,strategy:h})),E=a==="floating"?{x:o,y:i,width:n.floating.width,height:n.floating.height}:n.reference,y=await(s.getOffsetParent==null?void 0:s.getOffsetParent(c.floating)),w=await(s.isElement==null?void 0:s.isElement(y))?await(s.getScale==null?void 0:s.getScale(y))||{x:1,y:1}:{x:1,y:1},x=Qt(s.convertOffsetParentRelativeRectToViewportRelativeRect?await s.convertOffsetParentRelativeRectToViewportRelativeRect({elements:c,rect:E,offsetParent:y,strategy:h}):E);return{top:(k.top-x.top+u.top)/w.y,bottom:(x.bottom-k.bottom+u.bottom)/w.y,left:(k.left-x.left+u.left)/w.x,right:(x.right-k.right+u.right)/w.x}}var Fl=50,yn=async(r,t,e)=>{let{placement:o="bottom",strategy:i="absolute",middleware:s=[],platform:n}=e,c=n.detectOverflow?n:{...n,detectOverflow:vn},h=await(n.isRTL==null?void 0:n.isRTL(t)),g=await n.getElementRects({reference:r,floating:t,strategy:i}),{x:l,y:a}=wn(g,o,h),p=o,d=0,u={};for(let C=0;C<s.length;C++){let _=s[C];if(!_)continue;let{name:k,fn:E}=_,{x:y,y:w,data:x,reset:b}=await E({x:l,y:a,initialPlacement:o,placement:p,strategy:i,middlewareData:u,rects:g,platform:c,elements:{reference:r,floating:t}});l=y??l,a=w??a,u[k]={...u[k],...x},b&&d<Fl&&(d++,typeof b=="object"&&(b.placement&&(p=b.placement),b.rects&&(g=b.rects===!0?await n.getElementRects({reference:r,floating:t,strategy:i}):b.rects),{x:l,y:a}=wn(g,p,h)),C=-1)}return{x:l,y:a,placement:p,strategy:i,middlewareData:u}},xn=r=>({name:"arrow",options:r,async fn(t){let{x:e,y:o,placement:i,rects:s,platform:n,elements:c,middlewareData:h}=t,{element:g,padding:l=0}=Zt(r,t)||{};if(g==null)return{};let a=Ao(l),p={x:e,y:o},d=Lr(i),u=Ar(d),C=await n.getDimensions(g),_=d==="y",k=_?"top":"left",E=_?"bottom":"right",y=_?"clientHeight":"clientWidth",w=s.reference[u]+s.reference[d]-p[d]-s.floating[u],x=p[d]-s.reference[d],b=await(n.getOffsetParent==null?void 0:n.getOffsetParent(g)),v=b?b[y]:0;(!v||!await(n.isElement==null?void 0:n.isElement(b)))&&(v=c.floating[y]||s.floating[u]);let $=w/2-x/2,R=v/2-C[u]/2-1,T=Ct(a[k],R),I=Ct(a[E],R),P=T,X=v-C[u]-I,G=v/2-C[u]/2+$,L=$r(P,G,X),A=!h.arrow&&Xt(i)!=null&&G!==L&&s.reference[u]/2-(G<P?T:I)-C[u]/2<0,H=A?G<P?G-P:G-X:0;return{[d]:p[d]+H,data:{[d]:L,centerOffset:G-L-H,...A&&{alignmentOffset:H}},reset:A}}});var Cn=function(r){return r===void 0&&(r={}),{name:"flip",options:r,async fn(t){var e,o;let{placement:i,middlewareData:s,rects:n,initialPlacement:c,platform:h,elements:g}=t,{mainAxis:l=!0,crossAxis:a=!0,fallbackPlacements:p,fallbackStrategy:d="bestFit",fallbackAxisSideDirection:u="none",flipAlignment:C=!0,..._}=Zt(r,t);if((e=s.arrow)!=null&&e.alignmentOffset)return{};let k=Lt(i),E=_t(c),y=Lt(c)===c,w=await(h.isRTL==null?void 0:h.isRTL(g.floating)),x=p||(y||!C?[je(c)]:gn(c)),b=u!=="none";!p&&b&&x.push(...bn(c,C,u,w));let v=[c,...x],$=await h.detectOverflow(t,_),R=[],T=((o=s.flip)==null?void 0:o.overflows)||[];if(l&&R.push($[k]),a){let G=mn(i,n,w);R.push($[G[0]],$[G[1]])}if(T=[...T,{placement:i,overflows:R}],!R.every(G=>G<=0)){var I,P;let G=(((I=s.flip)==null?void 0:I.index)||0)+1,L=v[G];if(L&&(!(a==="alignment"?E!==_t(L):!1)||T.every(W=>_t(W.placement)===E?W.overflows[0]>0:!0)))return{data:{index:G,overflows:T},reset:{placement:L}};let A=(P=T.filter(H=>H.overflows[0]<=0).sort((H,W)=>H.overflows[1]-W.overflows[1])[0])==null?void 0:P.placement;if(!A)switch(d){case"bestFit":{var X;let H=(X=T.filter(W=>{if(b){let zt=_t(W.placement);return zt===E||zt==="y"}return!0}).map(W=>[W.placement,W.overflows.filter(zt=>zt>0).reduce((zt,Zn)=>zt+Zn,0)]).sort((W,zt)=>W[1]-zt[1])[0])==null?void 0:X[0];H&&(A=H);break}case"initialPlacement":A=c;break}if(i!==A)return{reset:{placement:A}}}return{}}}};var ql=new Set(["left","top"]);async function Bl(r,t){let{placement:e,platform:o,elements:i}=r,s=await(o.isRTL==null?void 0:o.isRTL(i.floating)),n=Lt(e),c=Xt(e),h=_t(e)==="y",g=ql.has(n)?-1:1,l=s&&h?-1:1,a=Zt(t,r),{mainAxis:p,crossAxis:d,alignmentAxis:u}=typeof a=="number"?{mainAxis:a,crossAxis:0,alignmentAxis:null}:{mainAxis:a.mainAxis||0,crossAxis:a.crossAxis||0,alignmentAxis:a.alignmentAxis};return c&&typeof u=="number"&&(d=c==="end"?u*-1:u),h?{x:d*l,y:p*g}:{x:p*g,y:d*l}}var _n=function(r){return r===void 0&&(r=0),{name:"offset",options:r,async fn(t){var e,o;let{x:i,y:s,placement:n,middlewareData:c}=t,h=await Bl(t,r);return n===((e=c.offset)==null?void 0:e.placement)&&(o=c.arrow)!=null&&o.alignmentOffset?{}:{x:i+h.x,y:s+h.y,data:{...h,placement:n}}}}},kn=function(r){return r===void 0&&(r={}),{name:"shift",options:r,async fn(t){let{x:e,y:o,placement:i,platform:s}=t,{mainAxis:n=!0,crossAxis:c=!1,limiter:h={fn:k=>{let{x:E,y}=k;return{x:E,y}}},...g}=Zt(r,t),l={x:e,y:o},a=await s.detectOverflow(t,g),p=_t(Lt(i)),d=$o(p),u=l[d],C=l[p];if(n){let k=d==="y"?"top":"left",E=d==="y"?"bottom":"right",y=u+a[k],w=u-a[E];u=$r(y,u,w)}if(c){let k=p==="y"?"top":"left",E=p==="y"?"bottom":"right",y=C+a[k],w=C-a[E];C=$r(y,C,w)}let _=h.fn({...t,[d]:u,[p]:C});return{..._,data:{x:_.x-e,y:_.y-o,enabled:{[d]:n,[p]:c}}}}}};var Sn=function(r){return r===void 0&&(r={}),{name:"size",options:r,async fn(t){var e,o;let{placement:i,rects:s,platform:n,elements:c}=t,{apply:h=()=>{},...g}=Zt(r,t),l=await n.detectOverflow(t,g),a=Lt(i),p=Xt(i),d=_t(i)==="y",{width:u,height:C}=s.floating,_,k;a==="top"||a==="bottom"?(_=a,k=p===(await(n.isRTL==null?void 0:n.isRTL(c.floating))?"start":"end")?"left":"right"):(k=a,_=p==="end"?"top":"bottom");let E=C-l.top-l.bottom,y=u-l.left-l.right,w=Ct(C-l[_],E),x=Ct(u-l[k],y),b=!t.middlewareData.shift,v=w,$=x;if((e=t.middlewareData.shift)!=null&&e.enabled.x&&($=y),(o=t.middlewareData.shift)!=null&&o.enabled.y&&(v=E),b&&!p){let T=at(l.left,0),I=at(l.right,0),P=at(l.top,0),X=at(l.bottom,0);d?$=u-2*(T!==0||I!==0?T+I:at(l.left,l.right)):v=C-2*(P!==0||X!==0?P+X:at(l.top,l.bottom))}await h({...t,availableWidth:$,availableHeight:v});let R=await n.getDimensions(c.floating);return u!==R.width||C!==R.height?{reset:{rects:!0}}:{}}}};function Rr(){return typeof window<"u"}function te(r){return $n(r)?(r.nodeName||"").toLowerCase():"#document"}function ct(r){var t;return(r==null||(t=r.ownerDocument)==null?void 0:t.defaultView)||window}function wt(r){var t;return(t=($n(r)?r.ownerDocument:r.document)||window.document)==null?void 0:t.documentElement}function $n(r){return Rr()?r instanceof Node||r instanceof ct(r).Node:!1}function dt(r){return Rr()?r instanceof Element||r instanceof ct(r).Element:!1}function kt(r){return Rr()?r instanceof HTMLElement||r instanceof ct(r).HTMLElement:!1}function En(r){return!Rr()||typeof ShadowRoot>"u"?!1:r instanceof ShadowRoot||r instanceof ct(r).ShadowRoot}function me(r){let{overflow:t,overflowX:e,overflowY:o,display:i}=pt(r);return/auto|scroll|overlay|hidden|clip/.test(t+o+e)&&i!=="inline"&&i!=="contents"}function An(r){return/^(table|td|th)$/.test(te(r))}function Ge(r){try{if(r.matches(":popover-open"))return!0}catch{}try{return r.matches(":modal")}catch{return!1}}var Nl=/transform|translate|scale|rotate|perspective|filter/,Vl=/paint|layout|strict|content/,Jt=r=>!!r&&r!=="none",Lo;function ge(r){let t=dt(r)?pt(r):r;return Jt(t.transform)||Jt(t.translate)||Jt(t.scale)||Jt(t.rotate)||Jt(t.perspective)||!Tr()&&(Jt(t.backdropFilter)||Jt(t.filter))||Nl.test(t.willChange||"")||Vl.test(t.contain||"")}function Ln(r){let t=Rt(r);for(;kt(t)&&!ee(t);){if(ge(t))return t;if(Ge(t))return null;t=Rt(t)}return null}function Tr(){return Lo==null&&(Lo=typeof CSS<"u"&&CSS.supports&&CSS.supports("-webkit-backdrop-filter","none")),Lo}function ee(r){return/^(html|body|#document)$/.test(te(r))}function pt(r){return ct(r).getComputedStyle(r)}function Ze(r){return dt(r)?{scrollLeft:r.scrollLeft,scrollTop:r.scrollTop}:{scrollLeft:r.scrollX,scrollTop:r.scrollY}}function Rt(r){if(te(r)==="html")return r;let t=r.assignedSlot||r.parentNode||En(r)&&r.host||wt(r);return En(t)?t.host:t}function Rn(r){let t=Rt(r);return ee(t)?r.ownerDocument?r.ownerDocument.body:r.body:kt(t)&&me(t)?t:Rn(t)}function Tt(r,t,e){var o;t===void 0&&(t=[]),e===void 0&&(e=!0);let i=Rn(r),s=i===((o=r.ownerDocument)==null?void 0:o.body),n=ct(i);if(s){let c=zr(n);return t.concat(n,n.visualViewport||[],me(i)?i:[],c&&e?Tt(c):[])}else return t.concat(i,Tt(i,[],e))}function zr(r){return r.parent&&Object.getPrototypeOf(r.parent)?r.frameElement:null}function Pn(r){let t=pt(r),e=parseFloat(t.width)||0,o=parseFloat(t.height)||0,i=kt(r),s=i?r.offsetWidth:e,n=i?r.offsetHeight:o,c=Ye(e)!==s||Ye(o)!==n;return c&&(e=s,o=n),{width:e,height:o,$:c}}function To(r){return dt(r)?r:r.contextElement}function be(r){let t=To(r);if(!kt(t))return bt(1);let e=t.getBoundingClientRect(),{width:o,height:i,$:s}=Pn(t),n=(s?Ye(e.width):e.width)/o,c=(s?Ye(e.height):e.height)/i;return(!n||!Number.isFinite(n))&&(n=1),(!c||!Number.isFinite(c))&&(c=1),{x:n,y:c}}var Ul=bt(0);function Mn(r){let t=ct(r);return!Tr()||!t.visualViewport?Ul:{x:t.visualViewport.offsetLeft,y:t.visualViewport.offsetTop}}function Hl(r,t,e){return t===void 0&&(t=!1),!e||t&&e!==ct(r)?!1:t}function re(r,t,e,o){t===void 0&&(t=!1),e===void 0&&(e=!1);let i=r.getBoundingClientRect(),s=To(r),n=bt(1);t&&(o?dt(o)&&(n=be(o)):n=be(r));let c=Hl(s,e,o)?Mn(s):bt(0),h=(i.left+c.x)/n.x,g=(i.top+c.y)/n.y,l=i.width/n.x,a=i.height/n.y;if(s){let p=ct(s),d=o&&dt(o)?ct(o):o,u=p,C=zr(u);for(;C&&o&&d!==u;){let _=be(C),k=C.getBoundingClientRect(),E=pt(C),y=k.left+(C.clientLeft+parseFloat(E.paddingLeft))*_.x,w=k.top+(C.clientTop+parseFloat(E.paddingTop))*_.y;h*=_.x,g*=_.y,l*=_.x,a*=_.y,h+=y,g+=w,u=ct(C),C=zr(u)}}return Qt({width:l,height:a,x:h,y:g})}function Or(r,t){let e=Ze(r).scrollLeft;return t?t.left+e:re(wt(r)).left+e}function In(r,t){let e=r.getBoundingClientRect(),o=e.left+t.scrollLeft-Or(r,e),i=e.top+t.scrollTop;return{x:o,y:i}}function Wl(r){let{elements:t,rect:e,offsetParent:o,strategy:i}=r,s=i==="fixed",n=wt(o),c=t?Ge(t.floating):!1;if(o===n||c&&s)return e;let h={scrollLeft:0,scrollTop:0},g=bt(1),l=bt(0),a=kt(o);if((a||!a&&!s)&&((te(o)!=="body"||me(n))&&(h=Ze(o)),a)){let d=re(o);g=be(o),l.x=d.x+o.clientLeft,l.y=d.y+o.clientTop}let p=n&&!a&&!s?In(n,h):bt(0);return{width:e.width*g.x,height:e.height*g.y,x:e.x*g.x-h.scrollLeft*g.x+l.x+p.x,y:e.y*g.y-h.scrollTop*g.y+l.y+p.y}}function jl(r){return Array.from(r.getClientRects())}function Yl(r){let t=wt(r),e=Ze(r),o=r.ownerDocument.body,i=at(t.scrollWidth,t.clientWidth,o.scrollWidth,o.clientWidth),s=at(t.scrollHeight,t.clientHeight,o.scrollHeight,o.clientHeight),n=-e.scrollLeft+Or(r),c=-e.scrollTop;return pt(o).direction==="rtl"&&(n+=at(t.clientWidth,o.clientWidth)-i),{width:i,height:s,x:n,y:c}}var Tn=25;function Kl(r,t){let e=ct(r),o=wt(r),i=e.visualViewport,s=o.clientWidth,n=o.clientHeight,c=0,h=0;if(i){s=i.width,n=i.height;let l=Tr();(!l||l&&t==="fixed")&&(c=i.offsetLeft,h=i.offsetTop)}let g=Or(o);if(g<=0){let l=o.ownerDocument,a=l.body,p=getComputedStyle(a),d=l.compatMode==="CSS1Compat"&&parseFloat(p.marginLeft)+parseFloat(p.marginRight)||0,u=Math.abs(o.clientWidth-a.clientWidth-d);u<=Tn&&(s-=u)}else g<=Tn&&(s+=g);return{width:s,height:n,x:c,y:h}}function Gl(r,t){let e=re(r,!0,t==="fixed"),o=e.top+r.clientTop,i=e.left+r.clientLeft,s=kt(r)?be(r):bt(1),n=r.clientWidth*s.x,c=r.clientHeight*s.y,h=i*s.x,g=o*s.y;return{width:n,height:c,x:h,y:g}}function zn(r,t,e){let o;if(t==="viewport")o=Kl(r,e);else if(t==="document")o=Yl(wt(r));else if(dt(t))o=Gl(t,e);else{let i=Mn(r);o={x:t.x-i.x,y:t.y-i.y,width:t.width,height:t.height}}return Qt(o)}function Dn(r,t){let e=Rt(r);return e===t||!dt(e)||ee(e)?!1:pt(e).position==="fixed"||Dn(e,t)}function Zl(r,t){let e=t.get(r);if(e)return e;let o=Tt(r,[],!1).filter(c=>dt(c)&&te(c)!=="body"),i=null,s=pt(r).position==="fixed",n=s?Rt(r):r;for(;dt(n)&&!ee(n);){let c=pt(n),h=ge(n);!h&&c.position==="fixed"&&(i=null),(s?!h&&!i:!h&&c.position==="static"&&!!i&&(i.position==="absolute"||i.position==="fixed")||me(n)&&!h&&Dn(r,n))?o=o.filter(l=>l!==n):i=c,n=Rt(n)}return t.set(r,o),o}function Xl(r){let{element:t,boundary:e,rootBoundary:o,strategy:i}=r,n=[...e==="clippingAncestors"?Ge(t)?[]:Zl(t,this._c):[].concat(e),o],c=zn(t,n[0],i),h=c.top,g=c.right,l=c.bottom,a=c.left;for(let p=1;p<n.length;p++){let d=zn(t,n[p],i);h=at(d.top,h),g=Ct(d.right,g),l=Ct(d.bottom,l),a=at(d.left,a)}return{width:g-a,height:l-h,x:a,y:h}}function Ql(r){let{width:t,height:e}=Pn(r);return{width:t,height:e}}function Jl(r,t,e){let o=kt(t),i=wt(t),s=e==="fixed",n=re(r,!0,s,t),c={scrollLeft:0,scrollTop:0},h=bt(0);function g(){h.x=Or(i)}if(o||!o&&!s)if((te(t)!=="body"||me(i))&&(c=Ze(t)),o){let d=re(t,!0,s,t);h.x=d.x+t.clientLeft,h.y=d.y+t.clientTop}else i&&g();s&&!o&&i&&g();let l=i&&!o&&!s?In(i,c):bt(0),a=n.left+c.scrollLeft-h.x-l.x,p=n.top+c.scrollTop-h.y-l.y;return{x:a,y:p,width:n.width,height:n.height}}function Ro(r){return pt(r).position==="static"}function On(r,t){if(!kt(r)||pt(r).position==="fixed")return null;if(t)return t(r);let e=r.offsetParent;return wt(r)===e&&(e=e.ownerDocument.body),e}function Fn(r,t){let e=ct(r);if(Ge(r))return e;if(!kt(r)){let i=Rt(r);for(;i&&!ee(i);){if(dt(i)&&!Ro(i))return i;i=Rt(i)}return e}let o=On(r,t);for(;o&&An(o)&&Ro(o);)o=On(o,t);return o&&ee(o)&&Ro(o)&&!ge(o)?e:o||Ln(r)||e}var tc=async function(r){let t=this.getOffsetParent||Fn,e=this.getDimensions,o=await e(r.floating);return{reference:Jl(r.reference,await t(r.floating),r.strategy),floating:{x:0,y:0,width:o.width,height:o.height}}};function ec(r){return pt(r).direction==="rtl"}var Xe={convertOffsetParentRelativeRectToViewportRelativeRect:Wl,getDocumentElement:wt,getClippingRect:Xl,getOffsetParent:Fn,getElementRects:tc,getClientRects:jl,getDimensions:Ql,getScale:be,isElement:dt,isRTL:ec};function qn(r,t){return r.x===t.x&&r.y===t.y&&r.width===t.width&&r.height===t.height}function rc(r,t){let e=null,o,i=wt(r);function s(){var c;clearTimeout(o),(c=e)==null||c.disconnect(),e=null}function n(c,h){c===void 0&&(c=!1),h===void 0&&(h=1),s();let g=r.getBoundingClientRect(),{left:l,top:a,width:p,height:d}=g;if(c||t(),!p||!d)return;let u=Ke(a),C=Ke(i.clientWidth-(l+p)),_=Ke(i.clientHeight-(a+d)),k=Ke(l),y={rootMargin:-u+"px "+-C+"px "+-_+"px "+-k+"px",threshold:at(0,Ct(1,h))||1},w=!0;function x(b){let v=b[0].intersectionRatio;if(v!==h){if(!w)return n();v?n(!1,v):o=setTimeout(()=>{n(!1,1e-7)},1e3)}v===1&&!qn(g,r.getBoundingClientRect())&&n(),w=!1}try{e=new IntersectionObserver(x,{...y,root:i.ownerDocument})}catch{e=new IntersectionObserver(x,y)}e.observe(r)}return n(!0),s}function Bn(r,t,e,o){o===void 0&&(o={});let{ancestorScroll:i=!0,ancestorResize:s=!0,elementResize:n=typeof ResizeObserver=="function",layoutShift:c=typeof IntersectionObserver=="function",animationFrame:h=!1}=o,g=To(r),l=i||s?[...g?Tt(g):[],...t?Tt(t):[]]:[];l.forEach(k=>{i&&k.addEventListener("scroll",e,{passive:!0}),s&&k.addEventListener("resize",e)});let a=g&&c?rc(g,e):null,p=-1,d=null;n&&(d=new ResizeObserver(k=>{let[E]=k;E&&E.target===g&&d&&t&&(d.unobserve(t),cancelAnimationFrame(p),p=requestAnimationFrame(()=>{var y;(y=d)==null||y.observe(t)})),e()}),g&&!h&&d.observe(g),t&&d.observe(t));let u,C=h?re(r):null;h&&_();function _(){let k=re(r);C&&!qn(C,k)&&e(),C=k,u=requestAnimationFrame(_)}return e(),()=>{var k;l.forEach(E=>{i&&E.removeEventListener("scroll",e),s&&E.removeEventListener("resize",e)}),a?.(),(k=d)==null||k.disconnect(),d=null,h&&cancelAnimationFrame(u)}}var Nn=_n;var Vn=kn,Un=Cn,zo=Sn;var Hn=xn;var Wn=(r,t,e)=>{let o=new Map,i={platform:Xe,...e},s={...i.platform,_c:o};return yn(r,t,{...i,platform:s})};function jn(r){return oc(r)}function Oo(r){return r.assignedSlot?r.assignedSlot:r.parentNode instanceof ShadowRoot?r.parentNode.host:r.parentNode}function oc(r){for(let t=r;t;t=Oo(t))if(t instanceof Element&&getComputedStyle(t).display==="none")return null;for(let t=Oo(r);t;t=Oo(t)){if(!(t instanceof Element))continue;let e=getComputedStyle(t);if(e.display!=="contents"&&(e.position!=="static"||ge(e)||t.tagName==="BODY"))return t}return null}function Yn(r){return r!==null&&typeof r=="object"&&"getBoundingClientRect"in r&&("contextElement"in r?r instanceof Element:!0)}var Pr=globalThis?.HTMLElement?.prototype.hasOwnProperty("popover"),j=class extends Z{constructor(){super(...arguments),this.localize=new st(this),this.active=!1,this.placement="top",this.boundary="viewport",this.distance=0,this.skidding=0,this.arrow=!1,this.arrowPlacement="anchor",this.arrowPadding=10,this.flip=!1,this.flipFallbackPlacements="",this.flipFallbackStrategy="best-fit",this.flipPadding=0,this.shift=!1,this.shiftPadding=0,this.autoSizePadding=0,this.hoverBridge=!1,this.updateHoverBridge=()=>{if(this.hoverBridge&&this.anchorEl&&this.popup){let r=this.anchorEl.getBoundingClientRect(),t=this.popup.getBoundingClientRect(),e=this.placement.includes("top")||this.placement.includes("bottom"),o=0,i=0,s=0,n=0,c=0,h=0,g=0,l=0;e?r.top<t.top?(o=r.left,i=r.bottom,s=r.right,n=r.bottom,c=t.left,h=t.top,g=t.right,l=t.top):(o=t.left,i=t.bottom,s=t.right,n=t.bottom,c=r.left,h=r.top,g=r.right,l=r.top):r.left<t.left?(o=r.right,i=r.top,s=t.left,n=t.top,c=r.right,h=r.bottom,g=t.left,l=t.bottom):(o=t.right,i=t.top,s=r.left,n=r.top,c=t.right,h=t.bottom,g=r.left,l=r.bottom),this.style.setProperty("--hover-bridge-top-left-x",`${o}px`),this.style.setProperty("--hover-bridge-top-left-y",`${i}px`),this.style.setProperty("--hover-bridge-top-right-x",`${s}px`),this.style.setProperty("--hover-bridge-top-right-y",`${n}px`),this.style.setProperty("--hover-bridge-bottom-left-x",`${c}px`),this.style.setProperty("--hover-bridge-bottom-left-y",`${h}px`),this.style.setProperty("--hover-bridge-bottom-right-x",`${g}px`),this.style.setProperty("--hover-bridge-bottom-right-y",`${l}px`)}}}async connectedCallback(){super.connectedCallback(),await this.updateComplete,this.start()}disconnectedCallback(){super.disconnectedCallback(),this.stop()}async updated(r){super.updated(r),r.has("active")&&(this.active?this.start():this.stop()),r.has("anchor")&&this.handleAnchorChange(),this.active&&(await this.updateComplete,this.reposition())}async handleAnchorChange(){if(await this.stop(),this.anchor&&typeof this.anchor=="string"){let r=this.getRootNode();this.anchorEl=r.getElementById(this.anchor)}else this.anchor instanceof Element||Yn(this.anchor)?this.anchorEl=this.anchor:this.anchorEl=this.querySelector('[slot="anchor"]');this.anchorEl instanceof HTMLSlotElement&&(this.anchorEl=this.anchorEl.assignedElements({flatten:!0})[0]),this.anchorEl&&this.start()}start(){!this.anchorEl||!this.active||!this.isConnected||(this.popup?.showPopover?.(),this.cleanup=Bn(this.anchorEl,this.popup,()=>{this.reposition()}))}async stop(){return new Promise(r=>{this.popup?.hidePopover?.(),this.cleanup?(this.cleanup(),this.cleanup=void 0,this.removeAttribute("data-current-placement"),this.style.removeProperty("--auto-size-available-width"),this.style.removeProperty("--auto-size-available-height"),requestAnimationFrame(()=>r())):r()})}reposition(){if(!this.active||!this.anchorEl||!this.popup)return;let r=[Nn({mainAxis:this.distance,crossAxis:this.skidding})];this.sync?r.push(zo({apply:({rects:o})=>{let i=this.sync==="width"||this.sync==="both",s=this.sync==="height"||this.sync==="both";this.popup.style.width=i?`${o.reference.width}px`:"",this.popup.style.height=s?`${o.reference.height}px`:""}})):(this.popup.style.width="",this.popup.style.height="");let t;Pr&&!Yn(this.anchor)&&this.boundary==="scroll"&&(t=Tt(this.anchorEl).filter(o=>o instanceof Element)),this.flip&&r.push(Un({boundary:this.flipBoundary||t,fallbackPlacements:this.flipFallbackPlacements,fallbackStrategy:this.flipFallbackStrategy==="best-fit"?"bestFit":"initialPlacement",padding:this.flipPadding})),this.shift&&r.push(Vn({boundary:this.shiftBoundary||t,padding:this.shiftPadding})),this.autoSize?r.push(zo({boundary:this.autoSizeBoundary||t,padding:this.autoSizePadding,apply:({availableWidth:o,availableHeight:i})=>{this.autoSize==="vertical"||this.autoSize==="both"?this.style.setProperty("--auto-size-available-height",`${i}px`):this.style.removeProperty("--auto-size-available-height"),this.autoSize==="horizontal"||this.autoSize==="both"?this.style.setProperty("--auto-size-available-width",`${o}px`):this.style.removeProperty("--auto-size-available-width")}})):(this.style.removeProperty("--auto-size-available-width"),this.style.removeProperty("--auto-size-available-height")),this.arrow&&r.push(Hn({element:this.arrowEl,padding:this.arrowPadding}));let e=Pr?o=>Xe.getOffsetParent(o,jn):Xe.getOffsetParent;Wn(this.anchorEl,this.popup,{placement:this.placement,middleware:r,strategy:Pr?"absolute":"fixed",platform:{...Xe,getOffsetParent:e}}).then(({x:o,y:i,middlewareData:s,placement:n})=>{let c=this.localize.dir()==="rtl",h={top:"bottom",right:"left",bottom:"top",left:"right"}[n.split("-")[0]];if(this.setAttribute("data-current-placement",n),Object.assign(this.popup.style,{left:`${o}px`,top:`${i}px`}),this.arrow){let g=s.arrow.x,l=s.arrow.y,a="",p="",d="",u="";if(this.arrowPlacement==="start"){let C=typeof g=="number"?`calc(${this.arrowPadding}px - var(--arrow-padding-offset))`:"";a=typeof l=="number"?`calc(${this.arrowPadding}px - var(--arrow-padding-offset))`:"",p=c?C:"",u=c?"":C}else if(this.arrowPlacement==="end"){let C=typeof g=="number"?`calc(${this.arrowPadding}px - var(--arrow-padding-offset))`:"";p=c?"":C,u=c?C:"",d=typeof l=="number"?`calc(${this.arrowPadding}px - var(--arrow-padding-offset))`:""}else this.arrowPlacement==="center"?(u=typeof g=="number"?"calc(50% - var(--arrow-size-diagonal))":"",a=typeof l=="number"?"calc(50% - var(--arrow-size-diagonal))":""):(u=typeof g=="number"?`${g}px`:"",a=typeof l=="number"?`${l}px`:"");Object.assign(this.arrowEl.style,{top:a,right:p,bottom:d,left:u,[h]:"calc(var(--arrow-base-offset) - var(--arrow-size-diagonal))"})}}),requestAnimationFrame(()=>this.updateHoverBridge()),this.dispatchEvent(new hn)}render(){return S`
      <slot name="anchor" @slotchange=${this.handleAnchorChange}></slot>

      <span
        part="hover-bridge"
        class=${et({"popup-hover-bridge":!0,"popup-hover-bridge-visible":this.hoverBridge&&this.active})}
      ></span>

      <div
        popover="manual"
        part="popup"
        class=${et({popup:!0,"popup-active":this.active,"popup-fixed":!Pr,"popup-has-arrow":this.arrow})}
      >
        <slot></slot>
        ${this.arrow?S`<div part="arrow" class="arrow" role="presentation"></div>`:""}
      </div>
    `}};j.css=dn;f([Q(".popup")],j.prototype,"popup",2);f([Q(".arrow")],j.prototype,"arrowEl",2);f([m()],j.prototype,"anchor",2);f([m({type:Boolean,reflect:!0})],j.prototype,"active",2);f([m({reflect:!0})],j.prototype,"placement",2);f([m()],j.prototype,"boundary",2);f([m({type:Number})],j.prototype,"distance",2);f([m({type:Number})],j.prototype,"skidding",2);f([m({type:Boolean})],j.prototype,"arrow",2);f([m({attribute:"arrow-placement"})],j.prototype,"arrowPlacement",2);f([m({attribute:"arrow-padding",type:Number})],j.prototype,"arrowPadding",2);f([m({type:Boolean})],j.prototype,"flip",2);f([m({attribute:"flip-fallback-placements",converter:{fromAttribute:r=>r.split(" ").map(t=>t.trim()).filter(t=>t!==""),toAttribute:r=>r.join(" ")}})],j.prototype,"flipFallbackPlacements",2);f([m({attribute:"flip-fallback-strategy"})],j.prototype,"flipFallbackStrategy",2);f([m({type:Object})],j.prototype,"flipBoundary",2);f([m({attribute:"flip-padding",type:Number})],j.prototype,"flipPadding",2);f([m({type:Boolean})],j.prototype,"shift",2);f([m({type:Object})],j.prototype,"shiftBoundary",2);f([m({attribute:"shift-padding",type:Number})],j.prototype,"shiftPadding",2);f([m({attribute:"auto-size"})],j.prototype,"autoSize",2);f([m()],j.prototype,"sync",2);f([m({type:Object})],j.prototype,"autoSizeBoundary",2);f([m({attribute:"auto-size-padding",type:Number})],j.prototype,"autoSizePadding",2);f([m({attribute:"hover-bridge",type:Boolean})],j.prototype,"hoverBridge",2);j=f([B("wa-popup")],j);var Kn=z`
  :host {
    border-width: 0;
  }

  .textarea {
    display: grid;
    align-items: center;
    margin: 0;
    border: none;
    outline: none;
    cursor: inherit;
    font: inherit;
    background-color: var(--wa-form-control-background-color);
    border-color: var(--wa-form-control-border-color);
    border-radius: var(--wa-form-control-border-radius);
    border-style: var(--wa-form-control-border-style);
    border-width: var(--wa-form-control-border-width);
    -webkit-appearance: none;
    outline: var(--wa-focus-ring-style) var(--wa-focus-ring-width) transparent;
    outline-offset: var(--wa-focus-ring-offset);

    &:focus-within {
      outline-color: var(--wa-color-focus);
    }
  }

  /* Appearance modifiers */
  :host([appearance='outlined']) .textarea {
    background-color: var(--wa-form-control-background-color);
    border-color: var(--wa-form-control-border-color);
  }

  :host([appearance='filled']) .textarea {
    background-color: var(--wa-color-neutral-fill-quiet);
    border-color: var(--wa-color-neutral-fill-quiet);
  }

  :host([appearance='filled-outlined']) .textarea {
    background-color: var(--wa-color-neutral-fill-quiet);
    border-color: var(--wa-form-control-border-color);
  }

  textarea {
    display: block;
    width: 100%;
    border: none;
    background: transparent;
    font: inherit;
    color: inherit;
    padding: calc(var(--wa-form-control-padding-block) - ((1lh - 1em) / 2)) var(--wa-form-control-padding-inline); /* accounts for the larger line height of textarea content */
    min-height: calc(var(--wa-form-control-height) - var(--border-width) * 2);
    box-shadow: none;
    margin: 0;

    &::placeholder {
      color: var(--wa-form-control-placeholder-color);
      user-select: none;
      -webkit-user-select: none;
    }

    &:autofill {
      &,
      &:hover,
      &:focus,
      &:active {
        box-shadow: none;
        caret-color: var(--wa-form-control-value-color);
      }
    }

    &:focus {
      outline: none;
    }
  }

  /* Shared textarea and size-adjuster positioning */
  .control,
  .size-adjuster {
    grid-area: 1 / 1 / 2 / 2;
  }

  .size-adjuster {
    visibility: hidden;
    pointer-events: none;
    opacity: 0;
    padding: 0;
  }

  textarea::-webkit-search-decoration,
  textarea::-webkit-search-cancel-button,
  textarea::-webkit-search-results-button,
  textarea::-webkit-search-results-decoration {
    -webkit-appearance: none;
  }

  /*
   * Resize types
   */

  :host([resize='none']) textarea {
    resize: none;
  }

  textarea,
  :host([resize='vertical']) textarea {
    resize: vertical;
  }

  :host([resize='horizontal']) textarea {
    resize: horizontal;
  }

  :host([resize='both']) textarea {
    resize: both;
  }

  :host([resize='auto']) textarea {
    height: auto;
    resize: none;
    overflow-y: hidden;
  }

  /*
   * Footer (hint + character count)
   */

  .footer {
    display: flex;
    align-items: baseline;
    gap: 1em;
  }

  .footer.has-count [part='hint'] {
    flex: 1 1 auto;
    min-width: 0;
  }

  .count {
    flex: 0 0 auto;
    color: var(--wa-form-control-hint-color);
    font-weight: var(--wa-form-control-hint-font-weight);
    line-height: var(--wa-form-control-hint-line-height);
    margin-block-start: 0.5em;
    font-size: var(--wa-font-size-smaller);
    margin-inline-start: auto;
  }
`;var Gn=z`
  .wa-visually-hidden:not(:focus-within),
  .wa-visually-hidden-force,
  .wa-visually-hidden-hint::part(hint),
  .wa-visually-hidden-label::part(label),
  .wa-visually-hidden-label::part(form-control-label) {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    clip: rect(0 0 0 0) !important;
    clip-path: inset(50%) !important;
    border: none !important;
    overflow: hidden !important;
    white-space: nowrap !important;
    padding: 0 !important;
  }
`;var M=class extends tt{constructor(){super(...arguments),this.assumeInteractionOn=["blur","input"],this.hasSlotController=new yt(this,"hint","label"),this.localize=new st(this),this.announcedCountText="",this.title="",this.name=null,this._value=null,this.defaultValue=this.getAttribute("value")??"",this.size="medium",this.appearance="outlined",this.label="",this.hint="",this.placeholder="",this.rows=4,this.resize="vertical",this.disabled=!1,this.readonly=!1,this.required=!1,this.spellcheck=!0,this.withLabel=!1,this.withHint=!1,this.withCount=!1}static get validators(){return[...super.validators,ce()]}get value(){return this.valueHasChanged?this._value:this._value??this.defaultValue}set value(r){this._value!==r&&(this.valueHasChanged=!0,this._value=r)}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{if(this.setTextareaDimensions(),this.updateResizeObserver(),this.didSSR&&this.input&&this.value!==this.input.value){let r=this.input.value;this.value=r}})}disconnectedCallback(){super.disconnectedCallback(),clearTimeout(this.countAnnounceTimeout),this.resizeObserver?.disconnect(),this.resizeObserver=void 0}updateResizeObserver(){let r=this.resize!=="none"&&this.resize!=="auto";r&&!this.resizeObserver&&this.input?(this.resizeObserver=new ResizeObserver(()=>this.setTextareaDimensions()),this.resizeObserver.observe(this.input)):!r&&this.resizeObserver&&(this.resizeObserver.disconnect(),this.resizeObserver=void 0)}handleBlur(){this.checkValidity()}handleChange(r){this.valueHasChanged=!0,this.value=this.input.value,this.setTextareaDimensions(),this.checkValidity(),this.relayNativeEvent(r,{bubbles:!0,composed:!0})}handleInput(r){this.valueHasChanged=!0,this.value=this.input.value,this.relayNativeEvent(r,{bubbles:!0,composed:!0}),this.scheduleCountAnnouncement()}scheduleCountAnnouncement(){clearTimeout(this.countAnnounceTimeout),this.countAnnounceTimeout=setTimeout(()=>{let r=(this.value??"").length;this.announcedCountText=this.maxlength!=null?this.localize.term("numCharactersRemaining",this.maxlength-r):this.localize.term("numCharacters",r)},1e3)}setTextareaDimensions(){if(this.resize==="none"){this.base.style.width="",this.base.style.height="";return}if(this.resize==="auto"){this.sizeAdjuster.style.height=`${this.input.clientHeight}px`,this.input.style.height="auto",this.input.style.height=`${this.input.scrollHeight}px`,this.base.style.width="",this.base.style.height="";return}if(this.input.style.width){let r=Number(this.input.style.width.split(/px/)[0])+2;this.base.style.width=`${r}px`}if(this.input.style.height){let r=Number(this.input.style.height.split(/px/)[0])+2;this.base.style.height=`${r}px`}}handleRowsChange(){this.setTextareaDimensions()}async handleValueChange(){await this.updateComplete,this.checkValidity(),this.setTextareaDimensions()}updated(r){r.has("resize")&&(this.setTextareaDimensions(),this.updateResizeObserver()),super.updated(r),r.has("value")&&this.customStates.set("blank",!this.value)}focus(r){this.input.focus(r)}blur(){this.input.blur()}select(){this.input.select()}scrollPosition(r){if(r){typeof r.top=="number"&&(this.input.scrollTop=r.top),typeof r.left=="number"&&(this.input.scrollLeft=r.left);return}return{top:this.input.scrollTop,left:this.input.scrollTop}}setSelectionRange(r,t,e="none"){this.input.setSelectionRange(r,t,e)}setRangeText(r,t,e,o="preserve"){let i=t??this.input.selectionStart,s=e??this.input.selectionEnd;this.input.setRangeText(r,i,s,o),this.value!==this.input.value&&(this.value=this.input.value,this.setTextareaDimensions())}formResetCallback(){this._value=null,this.input&&(this.input.value=this.value||""),super.formResetCallback()}render(){let r=this.hasUpdated?this.hasSlotController.test("label"):this.withLabel,t=this.hasUpdated?this.hasSlotController.test("hint"):this.withHint,e=this.label?!0:!!r,o=this.hint?!0:!!t,i=(this.value??"").length,s=this.maxlength!=null?this.localize.term("numCharactersRemaining",this.maxlength-i):this.localize.term("numCharacters",i);return S`
      <label
        part="form-control-label label"
        class=${et({label:!0,"has-label":e})}
        for="input"
        aria-hidden=${e?"false":"true"}
      >
        <slot name="label">${this.label}</slot>
      </label>

      <div part="base" class="textarea">
        <textarea
          part="textarea"
          id="input"
          class="control"
          title=${this.title}
          name=${D(this.name)}
          .value=${xr(this.value)}
          ?disabled=${this.disabled}
          ?readonly=${this.readonly}
          ?required=${this.required}
          placeholder=${D(this.placeholder)}
          rows=${D(this.rows)}
          minlength=${D(this.minlength)}
          maxlength=${D(this.maxlength)}
          autocapitalize=${D(this.autocapitalize)}
          autocorrect=${D(this.autocorrect)}
          ?autofocus=${this.autofocus}
          spellcheck=${D(this.spellcheck)}
          enterkeyhint=${D(this.enterkeyhint)}
          inputmode=${D(this.inputmode)}
          aria-describedby="hint"
          @change=${this.handleChange}
          @input=${this.handleInput}
          @blur=${this.handleBlur}
        ></textarea>

        <!-- This "adjuster" exists to prevent layout shifting. https://github.com/shoelace-style/shoelace/issues/2180 -->
        <div part="textarea-adjuster" class="size-adjuster" ?hidden=${this.resize!=="auto"}></div>
      </div>

      <div
        class=${et({footer:!0,"has-count":this.withCount})}
      >
        <slot
          id="hint"
          name="hint"
          part="hint"
          aria-hidden=${o?"false":"true"}
          class=${et({"has-slotted":o})}
          >${this.hint}</slot
        >

        ${this.withCount?S`
              <div part="count" class="count" aria-hidden="true">${s}</div>
              <div class="wa-visually-hidden-force" aria-live="polite">${this.announcedCountText}</div>
            `:""}
      </div>
    `}};M.css=[Kn,he,ht,Gn];f([K()],M.prototype,"announcedCountText",2);f([Q(".control")],M.prototype,"input",2);f([Q('[part~="base"]')],M.prototype,"base",2);f([Q(".size-adjuster")],M.prototype,"sizeAdjuster",2);f([m()],M.prototype,"title",2);f([m({reflect:!0})],M.prototype,"name",2);f([K()],M.prototype,"value",1);f([m({attribute:"value",reflect:!0})],M.prototype,"defaultValue",2);f([m({reflect:!0})],M.prototype,"size",2);f([m({reflect:!0})],M.prototype,"appearance",2);f([m()],M.prototype,"label",2);f([m({attribute:"hint"})],M.prototype,"hint",2);f([m()],M.prototype,"placeholder",2);f([m({type:Number})],M.prototype,"rows",2);f([m({reflect:!0})],M.prototype,"resize",2);f([m({type:Boolean})],M.prototype,"disabled",2);f([m({type:Boolean,reflect:!0})],M.prototype,"readonly",2);f([m({type:Boolean,reflect:!0})],M.prototype,"required",2);f([m({type:Number})],M.prototype,"minlength",2);f([m({type:Number})],M.prototype,"maxlength",2);f([m()],M.prototype,"autocapitalize",2);f([m({type:Boolean,converter:{fromAttribute:r=>!(!r||r==="off"),toAttribute:r=>r?"on":"off"}})],M.prototype,"autocorrect",2);f([m()],M.prototype,"autocomplete",2);f([m({type:Boolean})],M.prototype,"autofocus",2);f([m()],M.prototype,"enterkeyhint",2);f([m({type:Boolean,converter:{fromAttribute:r=>!(!r||r==="false"),toAttribute:r=>r?"true":"false"}})],M.prototype,"spellcheck",2);f([m()],M.prototype,"inputmode",2);f([m({attribute:"with-label",type:Boolean})],M.prototype,"withLabel",2);f([m({attribute:"with-hint",type:Boolean})],M.prototype,"withHint",2);f([m({attribute:"with-count",type:Boolean,reflect:!0})],M.prototype,"withCount",2);f([nt("rows",{waitUntilFirstUpdate:!0})],M.prototype,"handleRowsChange",1);f([nt("value",{waitUntilFirstUpdate:!0})],M.prototype,"handleValueChange",1);M=f([B("wa-textarea")],M);M.disableWarning?.("change-in-update");
/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
/**
 * @license
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
