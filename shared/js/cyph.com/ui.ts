import * as Cyph from '../cyph';
import {CyphDemo} from './cyphdemo';
import {Elements} from './elements';
import {HomeSections, pageTitles, Promos, States} from './enums';


/**
 * Controls the entire cyph.com UI.
 */
export class UI extends Cyph.UI.BaseButtonManager {
	/** @ignore */
	private static readonly linkInterceptSelector: string	= 'a[href^="/"]:not(a[href^="/blog"])';


	/** UI state/view. */
	public state: States				= States.home;

	/** Promo promo page state/view. */
	public promo: Promos				= Promos.none;

	/** Contact form state. */
	public readonly contactState		= {
		fromEmail: <string> '',
		fromName: <string> '',
		message: <string> '',
		sent: <boolean> false,
		subject: <string> '',
		to: <string> 'hello'
	};

	/** List of features to cycle through in hero section. */
	public readonly features: string[]	= [
		'Video Calls',
		'Voice Calls',
		'Chats',
		'Photos',
		'File Transfers'
	];

	/** Current feature displayed in hero section. */
	public featureIndex: number			= 0;

	/** Donation amount in dollars. */
	public readonly donationAmount: number			= 10;

	/** Individual pricing state. */
	public readonly individual: boolean				= false;

	/** Business pricing state. */
	public readonly business: boolean				= false;

	/** Telehealth pricing state. */
	public readonly telehealth: boolean				= false;

	/** Amount, category, and item respectively in cart. */
	public readonly cart: number[]					= [0, 0, 0];

	/** Beta plan price in dollars. */
	public readonly betaPlan: number				= 499;

	/** Business pricing: "The Basics" plan. */
	public readonly theBasics: number				= 99;

	/** Business pricing: "The Works" plan. */
	public readonly theWorks: number				= 499;

	/** Telehealth pricing: single-practicioner plan. */
	public readonly telehealthSingle: number		= 499;

	/** Custom telehealth pricing: number of doctors. */
	public readonly doctors: number					= 5;

	/** Custom telehealth pricing: price per doctor. */
	public readonly pricePerDoctor: number			= 350;

	/** Custom telehealth pricing: number of doctors required for price break. */
	public readonly telehealthPriceBreak: number	= 5;

	/** Custom telehealth pricing: % discount for price break. */
	public readonly telehealthDiscount: number		= 0.10;

	/** Home page state/view. */
	public homeSection: HomeSections;

	/** Cyph demo animation. */
	public readonly cyphDemo: CyphDemo;

	/** Signup form to be displayed throughout the site. */
	public readonly signupForm: Cyph.UI.ISignupForm;

	/** Carousel of features. */
	public featureCarousel: Cyph.UI.Carousel;

	/** Carousel of testimonials. */
	public testimonialCarousel: Cyph.UI.Carousel;

	/** @ignore */
	private cycleFeatures () : void {
		if (this.featureIndex < this.features.length - 1) {
			this.featureIndex++;
		}
		else {
			this.featureIndex	= 0;
		}
	}

	/** @ignore */
	private linkClickHandler (e: Event) : void {
		e.preventDefault();

		const href		= $(e.currentTarget).attr('href');
		let scrollDelay	= 500;

		if (href !== locationData.pathname || this.homeSection !== undefined) {
			scrollDelay	= 0;

			Cyph.UrlState.set(href);
		}

		if (this.homeSection === undefined) {
			setTimeout(() => this.scroll(0), scrollDelay);
		}
	}

	/** @ignore */
	private async onUrlStateChange (urlState: string) : Promise<void> {
		const urlStateSplit: string[]	= urlState.split('/');
		const urlStateBase: string		= urlStateSplit[0];

		const state: States	= (<any> States)[urlStateBase];
		const promo: Promos	= (<any> Promos)[urlStateBase];

		this.homeSection	= promo === undefined ?
			(<any> HomeSections)[urlStateBase] :
			HomeSections.promo
		;

		Cyph.UI.Elements.title().text(
			(<any> pageTitles)[urlStateBase] || pageTitles.default
		);

		Cyph.UrlState.set(urlState, true, true);

		if (this.homeSection !== undefined) {
			this.changeState(States.home);

			if (promo) {
				this.promo				= promo;
				this.signupForm.promo	= Promos[promo];
			}

			await Cyph.Util.sleep();

			if (this.homeSection === HomeSections.register) {
				this.dialogManager.baseDialog({
					locals: {
						cyph,
						signupForm: this.signupForm
					},
					onclose: () => Cyph.UrlState.set(''),
					templateUrl: '../../templates/register.html'
				});
			}
			else if (this.homeSection === HomeSections.invite) {
				this.signupForm.data.inviteCode	=
					Cyph.UrlState.get().split(HomeSections[HomeSections.invite] + '/')[1] || ''
				;

				this.dialogManager.baseDialog({
					locals: {
						cyph,
						signupForm: this.signupForm
					},
					onclose: () => Cyph.UrlState.set(''),
					templateUrl: '../../templates/invite.html'
				});
			}
			else {
				this.scroll(
					$('#' + HomeSections[this.homeSection] + '-section').offset().top -
					(
						this.homeSection === HomeSections.gettingstarted ?
							-1 :
							Elements.mainToolbar().height()
					)
				);
			}
		}
		else if (state === States.contact) {
			const to: string	= urlStateSplit[1];
			if (Cyph.Config.cyphEmailAddresses.indexOf(to) > -1) {
				this.contactState.to	= to;
			}

			this.changeState(state);
		}
		else if (state !== undefined) {
			this.changeState(state);
		}
		else if (urlStateBase === '') {
			this.changeState(States.home);
		}
		else if (urlStateBase === Cyph.UrlState.states.notFound) {
			this.changeState(States.error);
		}
		else {
			Cyph.UrlState.set(Cyph.UrlState.states.notFound);
		}
	}

	/** @ignore */
	private scroll (
		position: number,
		delayFactor: number = 0.75,
		oncomplete?: Function
	) : void {
		const delay: number	=
			delayFactor *
			Math.abs(Cyph.UI.Elements.document().scrollTop() - position)
		;

		Cyph.UI.Elements.html().add(Cyph.UI.Elements.body()).animate({scrollTop: position}, delay);

		if (oncomplete) {
			setTimeout(oncomplete, delay + 50);
		}
	}

	/** Update cart and open checkout screen. */
	public updateCart (
		amount: number,
		category: number,
		item: number
	) : void {
		this.cart[0]	= amount;
		this.cart[1]	= category;
		this.cart[2]	= item;

		this.changeState(States.checkout);
	}

	/**
	 * Changes UI state.
	 * @param state
	 */
	public changeState (state: States) : void {
		this.state	= state;
	}

	constructor (
		mobileMenu: () => Cyph.UI.ISidebar,

		/** @ignore */
		private readonly dialogManager: Cyph.UI.IDialogManager
	) {
		super(mobileMenu);

		this.signupForm	= new Cyph.UI.SignupForm();
		this.cyphDemo	= new CyphDemo(this.dialogManager);

		(async () => {
			Cyph.UrlState.onchange(async (urlState) => this.onUrlStateChange(urlState));

			const urlState: string	= Cyph.UrlState.get();
			setTimeout(
				() => Cyph.UrlState.set(urlState, true, false, false),
				(<any> HomeSections)[urlState] === undefined ? 0 : 2500
			);

			while (
				Elements.backgroundVideo().length < 1 ||
				Elements.featuresSection().length < 1 ||
				Elements.heroSection().length < 1 ||
				Elements.mainToolbar().length < 1 ||
				Elements.testimonialsSection().length < 1
			) {
				await Cyph.Util.sleep();
			}


			const wowDelay			= 'data-wow-delay';
			const platformWowDelay	= Cyph.Env.platformString + '-' + wowDelay;

			$('[' + platformWowDelay + ']').each((i: number, elem: HTMLElement) => {
				const $this: JQuery	= $(elem);
				$this.attr(wowDelay, $this.attr(platformWowDelay));
			});

			const platformClass: string	= Cyph.Env.platformString + '-class-';

			$('[class*="' + platformClass + '"]').each((i: number, elem: HTMLElement) => {
				const $this: JQuery	= $(elem);
				$this.attr(
					'class',
					$this.attr('class').replace(new RegExp(platformClass, 'g'), '')
				);
			});

			if (!Cyph.Env.isMobile) {
				new (<any> self).WOW({live: true}).init();
			}


			/* Disable background video on mobile */

			if (Cyph.Env.isMobile) {
				const $mobilePoster: JQuery	= $(document.createElement('img'));
				$mobilePoster.attr('src', Elements.backgroundVideo().attr('mobile-poster'));

				Elements.backgroundVideo().replaceWith($mobilePoster).remove();
				Elements.backgroundVideo	= () => $mobilePoster;
			}
			else {
				try {
					(<HTMLVideoElement> Elements.backgroundVideo()[0]).currentTime	= 1.25;
				}
				catch (_) {}

				setTimeout(
					() => (<any> Elements.backgroundVideo()).appear().
						on('appear', () => {
							try {
								(<HTMLVideoElement> Elements.backgroundVideo()[0]).play();
							}
							catch (_) {}
						}).
						on('disappear', () => {
							try {
								(<HTMLVideoElement> Elements.backgroundVideo()[0]).pause();
							}
							catch (_) {}
						})
					,
					2000
				);
			}


			/* Carousels */

			this.featureCarousel		= new Cyph.UI.Carousel(Elements.featuresSection());

			this.testimonialCarousel	= new Cyph.UI.Carousel(
				Elements.testimonialsSection(),
				() => Elements.heroSection().css(
					'min-height',
					`calc(100vh - ${40 + (
						Cyph.Env.isMobile ?
							40 :
							Elements.testimonialsSection().height()
					)}px)`
				)
			);


			/* Header / new cyph button animation */

			Elements.mainToolbar().toggleClass(
				'new-cyph-expanded',
				Cyph.UrlState.get() === ''
			);

			setTimeout(
				() => setInterval(
					() => Elements.mainToolbar().toggleClass(
						'new-cyph-expanded',
						this.state === States.home && (
							(
								this.promo !== Promos.none &&
								!Cyph.Env.isMobile &&
								Elements.heroText().is(':appeared')
							) ||
							Cyph.UI.Elements.footer().is(':appeared')
						)
					),
					500
				),
				3000
			);


			/* Section sizing

			if (!Cyph.Env.isMobile) {
				setInterval(() =>
					Elements.contentContainers().each((i: number, elem: HTMLElement) => {
						const $this: JQuery	= $(elem);

						$this.width(
							($this[0].innerText || $this.text()).
								split('\n').
								map((s: string) => (s.match(/[A-Za-z0-9]/g) || []).length).
								reduce((a: number, b: number) => Math.max(a, b))
							*
							parseInt($this.css('font-size'), 10) / 1.6
						);
					})
				, 2000);
			}
			*/


			/* Avoid full page reloads */

			$(UI.linkInterceptSelector).click(e => this.linkClickHandler(e));
			new MutationObserver(mutations => {
				for (let mutation of mutations) {
					for (let elem of mutation.addedNodes) {
						const $elem: JQuery	= $(elem);

						if ($elem.is(UI.linkInterceptSelector)) {
							$elem.click(e => this.linkClickHandler(e));
						}
						else {
							$elem.
								find(UI.linkInterceptSelector).
								click(e => this.linkClickHandler(e))
							;
						}
					}
				}
			}).observe(document.body, {
				attributes: false,
				characterData: false,
				childList: true,
				subtree: true
			});

			setInterval(() => this.cycleFeatures(), 4200);
			setTimeout(() => Cyph.UI.Elements.html().addClass('load-complete'), 750);

			/* Cyphertext easter egg */
			/* tslint:disable-next-line:no-unused-new */
			new (<any> self).Konami(() => {
				Cyph.UrlState.set('intro');
				Cyph.Util.retryUntilComplete(retry => {
					if (
						this.cyphDemo.desktop &&
						this.cyphDemo.desktop.state === Cyph.UI.Chat.States.chat
					) {
						if (Cyph.Env.isMobile) {
							this.cyphDemo.mobile.cyphertext.show();
						}
						else {
							this.cyphDemo.desktop.cyphertext.show();
							setTimeout(() => this.cyphDemo.mobile.cyphertext.show(), 8000);
						}
					}
					else {
						retry();
					}
				});
			});
		})();
	}
}
