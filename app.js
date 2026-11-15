'use strict';
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => value == null ? 'Цена по запросу' : Math.round(value).toLocaleString('ru-RU') + ' ₽';
const readStorage = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const config = window.STORE_CONFIG || {};
let products = [], byId = new Map(), cart = readStorage('container-cart-v3', {}), favorites = readStorage('container-favorites-v3', []);
let customer = readStorage('container-customer-v3', {}), pageLimit = 24, currentSlide = 0, toastTimeout;
const aliases = {Lada:['лада','ваз','lada'],Volkswagen:['volkswagen','vw'],Kia:['kia','киа'],Hyundai:['hyundai','хендай'],Renault:['renault','рено'],Ford:['ford','форд'],Chevrolet:['chevrolet','шевроле'],Toyota:['toyota','тойота'],Nissan:['nissan','ниссан'],Skoda:['skoda','шкода'],Peugeot:['peugeot','пежо'],Citroen:['citroen','citroën','ситроен'],Mitsubishi:['mitsubishi','митсубиси'],Opel:['opel','опель'],Audi:['audi','ауди'],BMW:['bmw','бмв'],Mazda:['mazda','мазда'],Subaru:['subaru','субару'],Suzuki:['suzuki','сузуки'],Daewoo:['daewoo','дэу'],Chery:['chery','чери'],'ГАЗ':['газ','газель'],'КАМАЗ':['камаз'],'УАЗ':['уаз'],Datsun:['datsun','датсун'],Chrysler:['chrysler'],Dodge:['dodge'],Volvo:['volvo'],Geely:['geely'],Jetour:['jetour'],Changan:['changan'],Haval:['haval']};
const normal = value => String(value || '').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const hasWord = (text, word) => (' '+normal(text)+' ').includes(' '+normal(word)+' ');
const carBrands = product => Object.entries(aliases).filter(([, words])=>words.some(word=>hasWord(product.name,word))).map(([brand])=>brand);
const catalogHref = (values = {}) => '#/catalog?' + new URLSearchParams(Object.entries(values).filter(([,v])=>v!=='' && v != null)).toString();
const productHref = id => '#/product/' + encodeURIComponent(id);
function imageUrl(product) { return product.photo || ''; }
function articleOf(product) { return product.article || product.manufacturer_article || product.sku || ''; }
function isCone(product) { return /^Конус(?: дорожный)?/i.test(product.name) && /320\s*(?:мм|mm)/i.test(product.name) && !/5\s*шт/i.test(product.name); }
function isCanister(product) { return /^Канистр/i.test(product.name) && /(?:^|\D)5\s*л/i.test(product.name); }
function isSpecial(product) { return isCone(product) || isCanister(product) || Number(product.discount)===50; }
function unitPrice(product) {
  if(isCone(product)) return 299;
  if(isCanister(product)) return 550;
  if(product.old == null) return product.price == null ? null : Number(product.price);
  return Math.round(Number(product.old) * (Number(product.discount)===50 ? .5 : .7));
}
function linePrice(product, quantity) { return isCone(product) ? Math.floor(quantity/4)*1000+(quantity%4)*299 : (unitPrice(product)||0)*quantity; }
function computeCart(input = cart) {
  const lines = Object.entries(input).map(([id,quantity])=>({product:byId.get(String(id)),quantity:Number(quantity)})).filter(line=>line.product && !line.product.unavailable && Number.isInteger(line.quantity) && line.quantity>0).map(line=>({...line,total:linePrice(line.product,line.quantity)}));
  const quantity = lines.reduce((sum,line)=>sum+line.quantity,0);
  const subtotal = lines.reduce((sum,line)=>sum+line.total,0);
  const eligible = quantity>=3 && subtotal>=1500;
  const fortyTotal = lines.reduce((sum,line)=>sum+(eligible && !isSpecial(line.product) && line.product.old!=null ? Math.round(line.product.old*.6)*line.quantity : line.total),0);
  const fortySaving = subtotal-fortyTotal;
  const largeSaving = subtotal>=50000 ? 5000 : 0;
  const saving = Math.max(fortySaving,largeSaving);
  const offer = saving===0 ? '' : largeSaving>fortySaving ? 'Скидка 5 000 ₽ от 50 000 ₽' : '40% вместо 30% от исходной цены';
  return {lines,quantity,subtotal,saving,total:subtotal-saving,offer,eligible,unknown:lines.some(line=>unitPrice(line.product)==null)};
}
window.ContainerPricing = {computeCart,isCone,isCanister,unitPrice,linePrice};
function persist() { try { localStorage.setItem('container-cart-v3',JSON.stringify(cart));localStorage.setItem('container-favorites-v3',JSON.stringify(favorites));localStorage.setItem('container-customer-v3',JSON.stringify(customer)); } catch {} const n=computeCart().quantity; $('cart-count').textContent=n; $('cart-count').hidden=!n; }
function toast(text) { $('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').classList.remove('show'),2400); }
function addCart(id,quantity=1) { if(!byId.has(String(id)) || byId.get(String(id)).unavailable)return;cart[id]=Math.min(999,(Number(cart[id])||0)+quantity);persist();toast('Товар добавлен в корзину');if(location.hash.startsWith('#/cart'))renderCart(new URLSearchParams()); }
function breadcrumb(items) { return '<nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="#/">Главная</a>'+items.map(([name,url])=>' <span aria-hidden="true">›</span> '+(url?`<a href="${escapeHtml(url)}">${escapeHtml(name)}</a>`:`<span>${escapeHtml(name)}</span>`)).join('')+'</nav>'; }
function photo(product, className='') { const src=imageUrl(product);return src?`<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(product.name)}" loading="lazy">`:'<span class="missing-photo">Фотография уточняется<br>№ '+escapeHtml(product.id)+'</span>'; }
function priceMarkup(product) { const price=unitPrice(product);const compareOld=!isCanister(product) && product.old>price;const percent=compareOld ? Math.round((1-price/product.old)*100):0;return `<strong>${money(price)}</strong>${compareOld?`<del>${money(product.old)}</del><span class="discount">−${percent}%</span>`:''}`; }
function card(product) { return `<article class="product-card"><a class="product-picture" href="${productHref(product.id)}">${photo(product)}</a><button class="favorite ${favorites.includes(String(product.id))?'selected':''}" data-favorite="${product.id}" aria-label="Добавить в избранное" aria-pressed="${favorites.includes(String(product.id))}">♡</button><div class="card-body"><a class="maker" href="${catalogHref({brand:product.brand})}">${escapeHtml(product.brand)}</a><a class="product-name" href="${productHref(product.id)}">${escapeHtml(product.name)}</a><div class="code">№ ${escapeHtml(product.id)} · ${articleOf(product)?'Артикул '+escapeHtml(articleOf(product)):'Код '+escapeHtml(product.barcode||'уточняется')}</div><div class="card-price">${priceMarkup(product)}</div><button class="button" data-add="${product.id}" ${product.unavailable?'disabled':''}>${product.unavailable?'Товар не идентифицирован':'В корзину'}</button></div></article>`; }
const banners = [
 {title:'Запчасти со склада',sale:'−30%',text:'От исходных цен на товары базовой акции.',cta:'В каталог',href:'#/catalog',thumb:'Запчасти −30%',caption:'Базовая скидка',className:'base',art:'assets/container.webp'},
 {title:'Конусы для парковки',sale:'299 ₽ / шт.',text:'Высота 320 мм. Четыре конуса за 1 000 ₽.',cta:'Выбрать конусы',href:catalogHref({promo:'cones'}),thumb:'Конусы 320 мм',caption:'299 ₽ / шт. · 4 за 1 000 ₽',className:'cone',art:'assets/products/53805562124.webp'},
 {title:'Больше деталей — больше выгода',sale:'−40% вместо −30%',text:'От 3 деталей на сумму от 1 500 ₽. Скидка от исходных цен.',cta:'Собрать заказ',href:catalogHref({promo:'bundle'}),thumb:'Скидка 40%',caption:'От 3 деталей и 1 500 ₽',className:'bundle',art:'assets/luzar_boxes.webp'},
 {title:'Большой заказ — большая выгода',sale:'−5 000 ₽',text:'При заказе от 50 000 ₽. Корзина выберет самое выгодное предложение.',cta:'К покупкам',href:catalogHref({promo:'large'}),thumb:'Минус 5 000 ₽',caption:'При заказе от 50 000 ₽',className:'large',art:'assets/container_detail.webp'},
 {title:'Крупный опт',sale:'Скидки более 50%',text:'Возможны индивидуальные условия в зависимости от объёма и состава заказа.',cta:'Обсудить опт',href:'#/cart?wholesale=1',thumb:'Крупный опт',caption:'Индивидуальные условия',className:'wholesale',art:'assets/container.webp'}
];
function hero() { return `<section class="hero" aria-label="Акции"><div class="hero-track" id="hero-track">${banners.map((banner,index)=>`<div class="slide ${banner.className}" aria-label="${escapeHtml(banner.title)}"><div class="banner-image" style="--offset:${[0.04,1.073,2.113,3.173,4.147][index]}"></div><div class="slide-content"><span class="eyebrow">АВТОДЕТАЛИ CONTAINER</span><h2>${banner.title}</h2><div class="sale">${banner.sale}</div><p>${banner.text}</p><a class="button" href="${banner.href}">${banner.cta} &nbsp; →</a></div><a class="banner-link" href="${banner.href}" aria-label="${escapeHtml(banner.cta)}"><span class="sr-only">${banner.cta}</span></a></div>`).join('')}</div></section><div class="hero-tabs" role="tablist" aria-label="Выбор акции">${banners.map((banner,index)=>`<button class="hero-tab" data-slide="${index}" role="tab" aria-selected="${index===currentSlide}"><strong>${banner.thumb}</strong><small>${banner.caption}</small></button>`).join('')}</div>`; }
function setSlide(index) { currentSlide=(index+banners.length)%banners.length;const track=$('hero-track');if(track)track.style.transform=`translateX(-${currentSlide*100}%)`;document.querySelectorAll('[data-slide]').forEach(button=>button.setAttribute('aria-selected',String(Number(button.dataset.slide)===currentSlide))); }
function home(params) {
  currentSlide=Math.max(0,Math.min(4,Number(params.get('slide'))||0));
  const featuredIds=[145,672,2,485];
  const preferred=featuredIds.map(id=>byId.get(String(id))).filter(Boolean);
  const items=[...preferred,...products.filter(p=>p.photo&&!featuredIds.includes(Number(p.id)))].slice(0,8);
  $('app').innerHTML=hero()+`<div class="section-head"><h2>Каталог</h2><a href="#/catalog">Смотреть всё →</a></div><div class="brand-pills">${['Все бренды',...new Set(products.map(p=>p.brand))].slice(0,7).map((brand,i)=>`<a class="brand-pill ${!i?'active':''}" href="${i?catalogHref({brand}):'#/catalog'}">${escapeHtml(brand)}</a>`).join('')}</div><div class="product-grid">${items.map(card).join('')}</div><div class="section-head"><h2>Для вашего автомобиля</h2><a href="#/catalog?selectCar=1">Выбрать автомобиль →</a></div><div class="chips">${Object.keys(aliases).slice(0,18).map(car=>`<a class="chip" href="${catalogHref({car})}">${car}</a>`).join('')}</div>`;
  setSlide(currentSlide);
}
function filtered(params) {
  const query=normal(params.get('q')),brand=params.get('brand'),category=params.get('category'),car=params.get('car'),model=normal(params.get('model')),promo=params.get('promo');
  let items=products.filter(p=>!brand||p.brand===brand).filter(p=>!category||p.category===category).filter(p=>!car||carBrands(p).includes(car)).filter(p=>!model||normal(p.name).includes(model));
  if(query){let terms=query.split(' ');items=items.filter(p=>terms.every(term=>normal([p.name,p.brand,p.category,p.barcode,p.id,articleOf(p),...(p.keywords||[])].join(' ')).includes(term)));}
  if(promo==='cones')items=items.filter(isCone);
  if(promo==='wipers')items=items.filter(p=>Number(p.discount)===50);
  if(promo==='bundle')items=items.filter(p=>!isSpecial(p));
  if(params.get('favorite'))items=items.filter(p=>favorites.includes(String(p.id)));
  if(params.get('sort')==='price-up')items.sort((a,b)=>(unitPrice(a)??Infinity)-(unitPrice(b)??Infinity));
  if(params.get('sort')==='price-down')items.sort((a,b)=>(unitPrice(b)??-1)-(unitPrice(a)??-1));
  if(params.get('sort')==='name')items.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  return items;
}
function option(value,label,selected){return `<option value="${escapeHtml(value)}" ${selected===value?'selected':''}>${escapeHtml(label)}</option>`;}
function catalog(params) {
  const items=filtered(params),categories=[...new Set(products.map(p=>p.category))],brands=[...new Set(products.map(p=>p.brand))];
  const title=params.get('category')||params.get('brand')||(params.get('favorite')?'Избранное':'Каталог');
  const queryObject=Object.fromEntries(params.entries());
  const link=(values)=>catalogHref({...queryObject,...values});
  const terms=params.get('promo')==='bundle'?'При трёх и более деталях и сумме корзины от 1 500 ₽ скидка на товары базовой акции составит 40% от исходной цены вместо 30%. Спеццены на конусы, канистры и дворники сохраняются.':params.get('promo')==='large'?'При сумме корзины от 50 000 ₽ доступна скидка 5 000 ₽. Предложения не складываются — автоматически выбирается более выгодное.':'';
  $('app').innerHTML=breadcrumb([[title]])+`<h1 class="page-title">${escapeHtml(title)}</h1>${terms?`<p class="promotion-terms">${terms}</p>`:''}<div class="catalog-layout"><aside class="filters ${params.has('selectCar')?'open':''}" id="filters"><div class="filter-group"><h3>Категории</h3><a href="${link({category:''})}" class="${!params.get('category')?'selected':''}">Все категории</a>${categories.map(category=>`<a class="${params.get('category')===category?'selected':''}" href="${link({category})}">${escapeHtml(category)}</a>`).join('')}</div><div class="filter-group"><h3>Бренд</h3><a href="${link({brand:''})}">Все производители</a>${brands.map(brand=>`<a class="${params.get('brand')===brand?'selected':''}" href="${link({brand})}">${escapeHtml(brand)}</a>`).join('')}</div><div class="filter-group"><h3>Автомобиль</h3><form id="car-filter"><label class="field"><span>Марка автомобиля</span><select name="car">${option('','Все марки',params.get('car'))}${Object.keys(aliases).map(car=>option(car,car,params.get('car'))).join('')}</select></label><label class="field"><span>Модель</span><input name="model" placeholder="Например, Rio" value="${escapeHtml(params.get('model')||'')}"></label><button class="button green wide">Применить</button></form></div><a class="button secondary" href="#/catalog">Сбросить фильтры</a></aside><section class="catalog-content"><button class="button secondary filter-toggle" id="filter-toggle">Фильтры и автомобиль</button><div class="catalog-toolbar"><span>Найдено товаров · ${items.length}</span><select class="sort" aria-label="Сортировка" id="sort">${option('','По каталогу',params.get('sort')||'')}${option('price-up','Сначала дешевле',params.get('sort'))}${option('price-down','Сначала дороже',params.get('sort'))}${option('name','По названию',params.get('sort'))}</select></div>${items.length?`<div class="product-grid">${items.slice(0,pageLimit).map(card).join('')}</div>${items.length>pageLimit?'<button class="button secondary load-more" id="load-more">Показать ещё</button>':''}`:'<div class="empty">По этим параметрам ничего не найдено.<br><a href="#/catalog">Сбросить фильтры</a></div>'}</section></div>`;
  $('filter-toggle').onclick=()=>$('filters').classList.toggle('open');
  $('sort').onchange=e=>{location.hash=link({sort:e.target.value});};
  $('car-filter').onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.target));customer.car=values.car;customer.model=values.model;persist();location.hash=link(values);};
  if($('load-more'))$('load-more').onclick=()=>{pageLimit+=24;const y=window.scrollY;catalog(params);window.scrollTo(0,y);};
}
function specifications(product) {
  const rows=[['Бренд',`<a href="${catalogHref({brand:product.brand})}">${escapeHtml(product.brand)}</a>`],['Категория',`<a href="${catalogHref({category:product.category})}">${escapeHtml(product.category)}</a>`],['№ складского каталога',escapeHtml(product.id)],['Артикул производителя',escapeHtml(articleOf(product)||'Уточняется')],['Наш артикул',escapeHtml(product.barcode||'Уточняется')],['Страница базового каталога',escapeHtml(product.source_page||'Уточняется')]];
  for(const [key,value] of Object.entries(product.specifications||product.specs||{}))rows.push([key,escapeHtml(value)]);
  if(isCanister(product))rows.push(['Объём','5 л'],['Продажа','Поштучно']);
  if(isCone(product))rows.push(['Высота','320 мм'],['Спецпредложение','299 ₽ / шт. · 4 за 1 000 ₽']);
  return '<table class="specs">'+rows.map(([key,value])=>`<tr><td>${escapeHtml(key)}</td><td>${value}</td></tr>`).join('')+'</table>';
}
function detail(id) {
  const product=byId.get(String(id));if(!product){$('app').innerHTML=breadcrumb([['Товар']])+'<div class="empty">Товар не найден. <a href="#/catalog">Открыть каталог</a></div>';return;}
  document.title=product.name+' — Автодетали Container';
  const cars=carBrands(product),original=product.source_page?'assets/catalog-pages/p'+product.source_page+'.webp':'';
  const related=products.filter(p=>p.id!==product.id&&p.category===product.category).slice(0,4);
  const description=product.description||`${product.name}. Производитель — ${product.brand}.`;
  $('app').innerHTML=breadcrumb([['Каталог','#/catalog'],[product.category,catalogHref({category:product.category})],[product.name]])+`<div class="detail-grid"><div><div class="detail-picture" data-zoom="${escapeHtml(imageUrl(product))}">${photo(product)}</div><div class="gallery">${imageUrl(product)?`<button data-photo="${escapeHtml(imageUrl(product))}" aria-label="Фото товара">${photo(product)}</button>`:''}${(product.gallery||[]).filter(url=>url!==imageUrl(product)).map((url,i)=>`<button data-photo="${escapeHtml(url)}" aria-label="Фото товара ${i+2}"><img src="${escapeHtml(url)}" alt="${escapeHtml(product.name)} — ракурс ${i+2}" loading="lazy"></button>`).join('')}${original?`<button data-photo="${original}" aria-label="Страница базового каталога"><img src="${original}" alt="Страница базового каталога"></button>`:''}</div><div class="product-source">${escapeHtml(product.photo_status || 'Фото из базового каталога')} · страница ${product.source_page||'уточняется'}</div></div><section class="detail-info"><a class="maker" href="${catalogHref({brand:product.brand})}">${escapeHtml(product.brand)}</a><h1>${escapeHtml(product.name)}</h1><div class="code">№ ${product.id} в складском каталоге · Наш артикул ${escapeHtml(product.barcode||'уточняется')}${articleOf(product)?' · Артикул производителя '+escapeHtml(articleOf(product)):''}</div><div class="detail-price">${priceMarkup(product)}</div><div class="availability">Наличие подтверждаем при оформлении</div><div class="detail-buy"><div class="qty"><button data-detail-minus aria-label="Уменьшить количество">−</button><output id="detail-qty">1</output><button data-detail-plus aria-label="Увеличить количество">+</button></div><button class="button" id="detail-add" ${product.unavailable?'disabled':''}>${product.unavailable?'Товар не идентифицирован':'В корзину'}</button></div>${isCone(product)?'<p class="note"><strong>Четыре за 1 000 ₽.</strong> Цена комплекта автоматически рассчитывается в корзине.</p>':''}<div class="note">Укажите автомобиль и VIN в корзине. Магазин проверит применяемость перед согласованием заказа.</div><div class="chips" style="margin-top:22px">${cars.map(car=>`<a class="chip" href="${catalogHref({car})}">${escapeHtml(car)}</a>`).join('')}<a class="chip" href="${catalogHref({brand:product.brand})}">Все ${escapeHtml(product.brand)}</a></div></section></div><section class="detail-sections"><div class="tabs" role="tablist"><button class="selected" data-tab="description">Описание</button><button data-tab="specs">Характеристики</button><button data-tab="fit">Применяемость</button><button data-tab="delivery">Доставка</button></div><div id="detail-tab"></div></section><div class="section-head"><h2>В этой категории</h2><a href="${catalogHref({category:product.category})}">Смотреть всё →</a></div><div class="product-grid">${related.map(card).join('')}</div>`;
  function showTab(tab){const sources=(product.sources||[]).map(source=>typeof source==='string'?{url:source,title:'Источник производителя'}:source).filter(source=>/^https?:\/\//.test(source.url||''));const sourceMarkup=sources.length?'<p>'+sources.map(source=>`<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title||'Источник производителя')} ↗</a>`).join('<br>')+'</p>':'';
    const texts={description:`<div class="description-grid"><div><h2>Описание</h2><p>${escapeHtml(description)}</p>${sourceMarkup}<p>Уточняйте размеры, комплектацию и применяемость по артикулу производителя.</p></div><div><h2>Характеристики</h2>${specifications(product)}</div></div>`,specs:specifications(product),fit:`<h2>Автомобили из наименования</h2><div class="chips">${cars.map(car=>`<a class="chip" href="${catalogHref({car})}">${car}</a>`).join('')||'<span>Конкретная марка в названии не указана.</span>'}</div><p style="margin-top:20px">${escapeHtml(product.name)}</p><p>Это сведения из базового каталога. Точная применяемость зависит от модификации, двигателя и года. Перед заказом передайте VIN и артикул для проверки.</p>`,delivery:'<h2>Доставка и оплата</h2><p>Самовывоз в Санкт-Петербурге и отправка обсуждаются с магазином. Стоимость доставки и способ оплаты согласовываются после подтверждения наличия.</p>'};$('detail-tab').innerHTML=texts[tab]||texts.description;}
  showTab('description');let quantity=1;
  document.querySelector('[data-detail-minus]').onclick=()=>{$('detail-qty').textContent=quantity=Math.max(1,quantity-1);};document.querySelector('[data-detail-plus]').onclick=()=>{$('detail-qty').textContent=quantity=Math.min(999,quantity+1);};$('detail-add').onclick=()=>addCart(product.id,quantity);
  document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b===button));showTab(button.dataset.tab);});
  document.querySelectorAll('[data-photo]').forEach(button=>button.onclick=()=>{const box=document.querySelector('.detail-picture');box.innerHTML=`<img src="${escapeHtml(button.dataset.photo)}" alt="${escapeHtml(product.name)}">`;box.dataset.zoom=button.dataset.photo;});
}
function orderText() {
  const totals=computeCart();const lines=[customer.wholesale?'Запрос оптового заказа · Автодетали Container':'Заказ · Автодетали Container',''];
  totals.lines.forEach(({product,quantity,total})=>lines.push(`${product.name}\n№ складского каталога ${product.id} · артикул ${articleOf(product)||'уточняется'} · складской код ${product.barcode||'уточняется'}\n${quantity} шт. · ${money(total)}\n`));
  lines.push(`Товары: ${money(totals.subtotal)}`);if(totals.saving)lines.push(`${totals.offer}: −${money(totals.saving)}`);lines.push(`Итого: ${money(totals.total)}${totals.unknown?' + товары с ценой по запросу':''}`,'',`Автомобиль: ${[customer.car,customer.model,customer.year].filter(Boolean).join(' ')||'не указан'}`,`VIN: ${customer.vin||'не указан'}`,`Имя: ${customer.name||'не указано'}`,`Контакт: ${customer.contact||'не указан'}`);if(customer.comment)lines.push(`Комментарий: ${customer.comment}`);lines.push('','Прошу подтвердить наличие, применяемость и доставку.');return lines.join('\n');
}
function messengerUrl(kind) { if(kind==='telegram'){const user=String(config.telegramUsername||'').replace(/^@/,'');return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(user)?'https://t.me/'+user:(/^\+[1-9]\d{7,14}$/.test(config.telegramPhone||'')?'https://t.me/'+config.telegramPhone:'');}return /^https:\/\/(?:max\.ru|web\.max\.ru)\//.test(config.maxChatUrl||'')?config.maxChatUrl:''; }
function customerFields(){return `<div class="checkout-panel"><h2>Автомобиль и контакты</h2><form id="customer-form"><div class="form-grid"><label class="field"><span>Марка автомобиля</span><select name="car">${option('','Выберите марку',customer.car)}${Object.keys(aliases).map(car=>option(car,car,customer.car)).join('')}</select></label><label class="field"><span>Модель</span><input name="model" placeholder="Например, Rio" value="${escapeHtml(customer.model||'')}"></label><label class="field"><span>Год выпуска</span><input name="year" inputmode="numeric" maxlength="4" placeholder="Например, 2018" value="${escapeHtml(customer.year||'')}"></label><label class="field"><span>VIN, необязательно</span><input name="vin" maxlength="17" autocapitalize="characters" placeholder="17 символов" value="${escapeHtml(customer.vin||'')}"></label><label class="field"><span>Ваше имя</span><input name="name" autocomplete="name" value="${escapeHtml(customer.name||'')}"></label><label class="field"><span>Телефон или Telegram</span><input name="contact" autocomplete="tel" placeholder="Как с вами связаться" value="${escapeHtml(customer.contact||'')}"></label><label class="field full"><span>Комментарий к заказу</span><textarea name="comment" placeholder="Доставка, вопросы по деталям…">${escapeHtml(customer.comment||'')}</textarea></label></div><button class="button secondary" type="submit">Подобрать ещё для этого авто</button></form><p class="summary-note">VIN передаётся магазину в тексте заказа для проверки. Автоматической проверки совместимости на сайте нет.</p></div>`;}
function renderCart(params) {
  if (params.get('wholesale')) { customer.wholesale = true; persist(); }
  const totals = computeCart();
  const recommendations = customer.car ? products.filter(p => !cart[p.id] && carBrands(p).includes(customer.car) && (!customer.model || normal(p.name).includes(normal(customer.model)))).slice(0, 4) : [];
  const heading = breadcrumb([['Корзина']]) + `<div class="cart-heading"><h1 class="page-title">${customer.wholesale ? 'Оптовый заказ' : 'Корзина'}</h1><span>${totals.quantity} шт.</span></div>`;
  if (!totals.lines.length) {
    $('app').innerHTML = heading + '<div class="empty">Корзина пока пуста.<br><a class="button" style="margin-top:20px" href="#/catalog">Выбрать товары</a></div>';
    return;
  }
  const rows = totals.lines.map(({product, quantity, total}) => `<article class="cart-item">
    <a href="${productHref(product.id)}">${photo(product)}</a>
    <div><h2><a href="${productHref(product.id)}">${escapeHtml(product.name)}</a></h2>
    <div class="code">№ ${product.id} · ${articleOf(product) ? 'Артикул '+escapeHtml(articleOf(product)) : 'Код '+escapeHtml(product.barcode || 'уточняется')}</div>
    <div class="qty"><button data-minus="${product.id}" aria-label="Уменьшить количество">−</button><output>${quantity}</output><button data-plus="${product.id}" aria-label="Увеличить количество">+</button></div></div>
    <div class="cart-cost"><strong>${unitPrice(product) == null ? 'По запросу' : money(total)}</strong><button class="remove" data-remove="${product.id}">Удалить</button></div>
  </article>`).join('');
  const recommendationMarkup = recommendations.length
    ? `<p class="summary-note">Подбор по наименованиям. Применяемость проверяем по VIN перед заказом.</p><div class="product-grid">${recommendations.map(card).join('')}</div>`
    : `<div class="note">${customer.car ? 'Совпадений по указанной модели пока не найдено. Попробуйте поиск по марке.' : 'Укажите марку и модель выше, чтобы увидеть товары из каталога для этого автомобиля.'}</div>`;
  $('app').innerHTML = heading + `<div class="cart-layout"><section>
    <div class="cart-list">${rows}</div>${customerFields()}</section>
    <aside class="cart-summary"><h2>Ваш заказ</h2>
    <div class="sum-row"><span>Товары (${totals.quantity})</span><span>${money(totals.subtotal)}</span></div>
    ${totals.saving ? `<div class="sum-row saving"><span>${totals.offer}</span><span>−${money(totals.saving)}</span></div>` : ''}
    <div class="sum-row total"><span>Итого</span><span>${money(totals.total)}</span></div>
    ${totals.unknown ? '<p class="notice">В корзине есть товары с ценой по запросу. Их стоимость магазин добавит при подтверждении.</p>' : ''}
    <p class="summary-note">Спеццены сохраняются. Акции 40% и 5 000 ₽ не суммируются — выбирается наибольшая скидка. Порог считается до дополнительной скидки.</p>
    <fieldset class="messengers"><legend>Чат с магазином</legend>
    <label><input type="radio" name="messenger" value="telegram" ${customer.messenger !== 'max' ? 'checked' : ''}> Telegram</label>
    <label><input type="radio" name="messenger" value="max" ${customer.messenger === 'max' ? 'checked' : ''}> MAX</label></fieldset>
    <button class="button wide" id="checkout">Скопировать и открыть чат</button>
    <button class="button secondary wide" id="copy-order" style="margin-top:10px">Скопировать заказ</button>
    <p class="checkout-message" id="checkout-status"></p>
    <details><summary class="summary-note">Посмотреть текст заказа</summary><textarea class="order-text" id="order-preview" readonly aria-label="Текст заказа">${escapeHtml(orderText())}</textarea></details>
    </aside></div>
    <div class="section-head"><h2>Ещё для вашего автомобиля</h2>${customer.car ? `<a href="${catalogHref({car:customer.car,model:customer.model})}">Смотреть всё →</a>` : ''}</div>${recommendationMarkup}`;
  const form = $('customer-form');
  const updateCustomer = () => {
    Object.assign(customer, Object.fromEntries(new FormData(form)));
    customer.vin = String(customer.vin || '').toUpperCase();
    persist();
    $('order-preview').value = orderText();
  };
  form.oninput = updateCustomer;
  form.onchange = updateCustomer;
  form.onsubmit = event => { event.preventDefault(); updateCustomer(); renderCart(params); };
  function updateMessenger() {
    customer.messenger = document.querySelector('[name=messenger]:checked').value;
    persist();
    const ready = !!messengerUrl(customer.messenger);
    $('checkout').disabled = !ready;
    $('checkout-status').textContent = ready
      ? 'Откроется личный чат магазина. Вставьте скопированный заказ в сообщение и нажмите «Отправить».'
      : 'Адрес чата магазина пока не подключён. Текст заказа можно скопировать; переход станет доступен после настройки.';
  }
  document.querySelectorAll('[name=messenger]').forEach(input => input.onchange = updateMessenger);
  updateMessenger();
  $('copy-order').onclick = () => copyOrder();
  $('checkout').onclick = async () => {
    updateCustomer();
    const url = messengerUrl(customer.messenger);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
    await copyOrder();
    $('checkout-status').textContent = 'Откроется чат. Вставьте текст заказа и отправьте сообщение магазину.';
  };
}
async function copyOrder(){const text=orderText();try{await navigator.clipboard.writeText(text);toast('Заказ скопирован — вставьте его в чат');}catch{const field=$('order-preview');if(field){field.closest('details').open=true;field.focus();field.select();toast('Выделен текст заказа — скопируйте его');}}}
function infoPage(page){const contacts=page==='contacts';$('app').innerHTML=breadcrumb([[contacts?'Контакты':'Доставка и оплата']])+`<article class="info-page"><h1>${contacts?'Контакты':'Доставка и оплата'}</h1>${contacts?`<p>${escapeHtml(config.city||'Санкт-Петербург')}</p><p><a href="tel:${escapeHtml(config.phone||'+79112282935')}">${escapeHtml(config.phone||'+79112282935')}</a></p><p>Наличие, время самовывоза и передачу товара согласуйте с магазином перед поездкой.</p>`:'<p>Самовывоз в Санкт-Петербурге. Отправку в другой город, стоимость доставки и способ оплаты согласовываем индивидуально после подтверждения заказа.</p><p>Добавьте товары в корзину, укажите автомобиль и контакт. Подготовленный заказ можно отправить в личный чат магазина в Telegram или MAX после подключения адреса чата.</p>'}<h2>Как считаются акции</h2><p>Базовая скидка — 30% от исходной цены. От 3 деталей и суммы корзины от 1 500 ₽ скидка на товары базовой акции увеличивается до 40% от исходной цены. Конусы 320 мм — 299 ₽ за штуку или 4 за 1 000 ₽, канистры 5 л — 550 ₽ за штуку, отдельные грузовые дворники — со скидкой 50%.</p><p>От 50 000 ₽ доступна скидка 5 000 ₽. Она сравнивается с предложением 40%, применяется наибольшая выгода. Порог рассчитывается от суммы товаров до дополнительной скидки. Крупный опт обсуждается отдельно.</p></article>`;}
function route(){const raw=(location.hash||'#/').slice(2);const [path,query='']=raw.split('?');const params=new URLSearchParams(query);document.title='Автодетали Container — каталог запчастей';$('search-input').value=params.get('q')||'';if(path==='catalog')catalog(params);else if(path.startsWith('product/'))detail(decodeURIComponent(path.slice(8)));else if(path==='cart')renderCart(params);else if(path==='delivery'||path==='contacts')infoPage(path);else home(params);window.scrollTo(0,0);}
document.addEventListener('click',event=>{const target=event.target.closest('button,[data-zoom]');if(!target)return;if(target.dataset.add)addCart(target.dataset.add);if(target.dataset.favorite){const id=target.dataset.favorite;favorites=favorites.includes(id)?favorites.filter(value=>value!==id):[...favorites,id];persist();target.classList.toggle('selected',favorites.includes(id));target.setAttribute('aria-pressed',String(favorites.includes(id)));toast(favorites.includes(id)?'Добавлено в избранное':'Удалено из избранного');}if(target.dataset.slide!==undefined)setSlide(Number(target.dataset.slide));if(target.dataset.plus){cart[target.dataset.plus]=Math.min(999,(cart[target.dataset.plus]||0)+1);persist();renderCart(new URLSearchParams());}if(target.dataset.minus){cart[target.dataset.minus]--;if(cart[target.dataset.minus]<=0)delete cart[target.dataset.minus];persist();renderCart(new URLSearchParams());}if(target.dataset.remove){delete cart[target.dataset.remove];persist();renderCart(new URLSearchParams());}if(target.dataset.zoom){$('zoom-image').src=target.dataset.zoom;$('zoom').showModal();}});
$('zoom').querySelector('.close').onclick=()=>$('zoom').close();$('zoom').onclick=event=>{if(event.target===$('zoom'))$('zoom').close();};
$('search-form').onsubmit=event=>{event.preventDefault();pageLimit=24;const destination=catalogHref({q:$('search-input').value.trim()});if(location.hash===destination)route();else location.hash=destination;};
window.addEventListener('hashchange',()=>{pageLimit=24;route();});
function start(data){products=data;byId=new Map(products.map(p=>[String(p.id),p]));for(const id of Object.keys(cart)){if(!byId.has(id)||byId.get(id).unavailable||!Number.isInteger(Number(cart[id]))||Number(cart[id])<=0)delete cart[id];else cart[id]=Math.min(999,Number(cart[id]));}persist();route();}
if(Array.isArray(window.CATALOG))start(window.CATALOG);else fetch('products.json').then(response=>{if(!response.ok)throw Error('catalog');return response.json();}).then(start).catch(()=>{$('app').innerHTML='<div class="empty">Не удалось открыть каталог. Обновите страницу.</div>';});
