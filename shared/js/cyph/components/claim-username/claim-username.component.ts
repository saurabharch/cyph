import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {usernameMask} from '../../account';
import {emailPattern} from '../../email-pattern';
import {StringsService} from '../../services/strings.service';
import {email} from '../../util/email';
import {stringify} from '../../util/serialization';


/**
 * Angular component for claim username UI.
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'cyph-claim-username',
	styleUrls: ['./claim-username.component.scss'],
	templateUrl: './claim-username.component.html'
})
export class ClaimUsernameComponent {
	/** User's email address. */
	@Input() public email: string				= '';

	/** @see emailPattern */
	public readonly emailPattern				= emailPattern;

	/** Indicates whether form has been submitted. */
	public readonly submitted					= new BehaviorSubject<boolean>(false);

	/** Requested username. */
	@Input() public username: string			= '';

	/** Requested username alternate/backup. */
	@Input() public usernameAlternate: string	= '';

	/** @see usernameMask */
	public readonly usernameMask: any			= usernameMask;

	/** Submits form. */
	public submit () : void {
		email(
			'username-request@cyph.com',
			undefined,
			stringify({
				email: this.email,
				username: this.username,
				usernameAlternate: this.usernameAlternate
			}),
			this.email
		);

		this.submitted.next(true);
	}

	constructor (
		/** @see StringsService */
		public readonly stringsService: StringsService
	) {}
}
